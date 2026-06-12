/**
 * Synchronous soup item filters backed by the Rust wasm evaluator
 * (`@soup-filter-wasm`), for use as TanStack `meta.itemFilter` predicates in
 * the normalized cache's optimistic operations.
 *
 * The wasm module loads asynchronously while the filter contract is
 * synchronous, so this facade is deliberately permissive: until the module is
 * ready — and whenever the evaluator answers `'unknown'` — items pass the
 * filter, matching the historical behavior of the hand-written TS matcher,
 * which passed every filter it didn't implement. A definite `'noMatch'`
 * skips the optimistic insert; the server refetch reconciles anything
 * permissiveness lets through.
 *
 * Two context sources shrink the unknown set:
 * - requester context (current user id from the auth cache, the system
 *   Assignees property id) decides task importance / created-by-me filters;
 * - per-item notification existence read from the notification query cache
 *   decides done/seen filters. Only positives are asserted — the cache is
 *   paginated and drops done notifications, so absence proves nothing.
 */

import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { authKeys } from '@queries/auth/keys';
import { queryClient } from '@queries/client';
import { notificationKeys } from '@queries/notification/keys';
import type { SoupApiItem } from '@service-storage/generated/schemas';
import {
  type CompiledSoupFilter,
  compileSoupAst,
  compileSoupFilters,
  loadSoupFilterWasm,
  type SoupFilterOptions,
  type SoupItemState,
} from '@soup-filter-wasm';

let wasmReady = false;
let warnedCompileFailure = false;

// Kick the (~200KB gzipped) module load as soon as the soup query layer is
// imported, so filters are live by the time a user can trigger an optimistic
// insert.
const preload = loadSoupFilterWasm().then(() => {
  wasmReady = true;
});
preload.catch(() => {
  // Permissive fallback stays in effect; soup behaves like before the wasm
  // filter existed.
});

type FilterKind = 'typed' | 'ast';

/**
 * Compiled filters cached by their serialized body + requester context. Soup
 * view bodies are few and stable within a session; a small LRU (insertion
 * order refreshed on every hit) keeps wasm memory bounded while letting
 * every insert reuse the compiled AST.
 */
const compiledCache = new Map<string, CompiledSoupFilter>();
const COMPILED_CACHE_MAX = 64;

function rememberCompiled(key: string, filter: CompiledSoupFilter) {
  compiledCache.set(key, filter);
  if (compiledCache.size > COMPILED_CACHE_MAX) {
    const [oldestKey, oldest] = compiledCache.entries().next().value as [
      string,
      CompiledSoupFilter,
    ];
    compiledCache.delete(oldestKey);
    oldest.dispose();
  }
}

function recallCompiled(key: string): CompiledSoupFilter | undefined {
  const cached = compiledCache.get(key);
  if (!cached) return undefined;
  // Refresh recency: Map iteration is insertion-ordered, so re-inserting
  // makes eviction least-recently-used rather than first-in-first-out.
  compiledCache.delete(key);
  compiledCache.set(key, cached);
  return cached;
}

/** Requester context, read synchronously from the auth query cache. */
function filterOptions(): SoupFilterOptions {
  const userInfo = queryClient.getQueryData<{ id?: string }>(
    authKeys.userInfo.queryKey
  );
  return {
    currentUserId: userInfo?.id,
    assigneesPropertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
  };
}

async function compile(
  kind: FilterKind,
  bodyJson: string,
  options: SoupFilterOptions
): Promise<CompiledSoupFilter> {
  const body: unknown = JSON.parse(bodyJson);
  return kind === 'ast'
    ? await compileSoupAst(body, options)
    : await compileSoupFilters(body, options);
}

function getCompiled(
  kind: FilterKind,
  bodyJson: string
): CompiledSoupFilter | undefined {
  const options = filterOptions();
  const key = `${kind}:${options.currentUserId ?? ''}:${bodyJson}`;
  const cached = recallCompiled(key);
  if (cached) return cached;
  if (!wasmReady) return undefined;
  // The module is loaded, so compile() resolves on the microtask queue; the
  // current (synchronous) check stays permissive and the next one hits the
  // cache. Avoids blocking inserts on JSON round-trips for brand-new bodies.
  compile(kind, bodyJson, options)
    .then((filter) => rememberCompiled(key, filter))
    .catch((err) => {
      // A compile failure means the body didn't parse as the Rust filter
      // types — i.e. the TS builder (compile.ts) drifted from the backend.
      // Loud in dev; warn once in production where the permissive fallback
      // keeps soup functional.
      if (import.meta.env.DEV) {
        console.error('[soup] wasm filter compilation failed', {
          kind,
          body: bodyJson,
          err,
        });
      } else if (!warnedCompileFailure) {
        warnedCompileFailure = true;
        console.warn('[soup] wasm filter compilation failed', err);
      }
    });
  return undefined;
}

/** Notification entity_type values for the soup tags whose literals consult
 * notification state. Email is excluded deliberately — the email SQL handles
 * notification literals at a different stage and the evaluator keeps them
 * undecidable. */
const NOTIFICATION_ENTITY_TYPE_BY_TAG: Partial<Record<string, string>> = {
  document: 'document',
  chat: 'chat',
  project: 'project',
  channel: 'channel',
};

type CachedNotification = {
  entity_id?: string;
  entity_type?: string;
  done?: boolean;
  viewed_at?: string | null;
};

type NotificationPages = {
  pages?: Array<{ items?: CachedNotification[] }>;
};

function soupItemEntityId(item: SoupApiItem): string | undefined {
  // Mirrors getSoupItemId in normalized-cache/operations.ts (not imported to
  // keep this module's import graph acyclic).
  switch (item.tag) {
    case 'channel':
      return item.data.channel.id;
    case 'call':
      return item.data.callId;
    default:
      return item.data.id;
  }
}

/**
 * Assert per-item notification existence from the cached user-notification
 * pages. Positives only: the cache is paginated and drops done
 * notifications, so a miss never proves absence.
 */
function notificationState(item: SoupApiItem): SoupItemState | undefined {
  const entityType = NOTIFICATION_ENTITY_TYPE_BY_TAG[item.tag];
  if (!entityType) return undefined;
  const entityId = soupItemEntityId(item);
  if (!entityId) return undefined;

  const state: SoupItemState = {};
  let found = false;
  for (const [, data] of queryClient.getQueriesData<NotificationPages>({
    queryKey: notificationKeys.user._def,
  })) {
    for (const page of data?.pages ?? []) {
      for (const notification of page.items ?? []) {
        if (
          notification.entity_id !== entityId ||
          notification.entity_type !== entityType
        ) {
          continue;
        }
        found = true;
        if (notification.done === true) state.hasDoneNotification = true;
        if (notification.done === false) state.hasUndoneNotification = true;
        if (notification.viewed_at != null) state.hasSeenNotification = true;
        if (notification.viewed_at === null) state.hasUnseenNotification = true;
      }
    }
  }
  return found ? state : undefined;
}

/**
 * Build a synchronous `(item) => boolean` insert predicate for a soup list
 * query. `kind: 'typed'` takes the `POST /items/soup` body; `kind: 'ast'`
 * takes the `POST /items/soup/ast` body (extra non-filter fields like
 * `email_view` are ignored by the Rust side).
 */
export function makeSoupItemFilter(
  kind: FilterKind,
  getBody: () => unknown
): (item: SoupApiItem) => boolean {
  return (item) => {
    const body = getBody();
    if (!body) return true;
    const compiled = getCompiled(kind, JSON.stringify(body));
    if (!compiled) return true;
    try {
      return compiled.matches(item, notificationState(item)) !== 'noMatch';
    } catch (err) {
      // The wrapper throws on items the evaluator can't even parse (no
      // tag/data). The predicate contract is "never throw, default
      // permissive" — a throw here would abort the whole optimistic cache
      // operation mid-write.
      if (import.meta.env.DEV) {
        console.error('[soup] wasm filter evaluation failed', { item, err });
      }
      return true;
    }
  };
}
