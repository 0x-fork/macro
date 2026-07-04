import { ENABLE_EMAIL_CONTENT_SYNC } from '@core/constant/featureFlags';
import { DEFAULT_THREAD_MESSAGES_LIMIT } from '@core/constant/pagination';
import { emailClient } from '@service-email/client';
import type { ApiThread } from '@service-email/generated/schemas';
import type { InfiniteData } from '@tanstack/query-core';
import { queryClient } from '../../client';
import { emailKeys } from '../keys';
import {
  DEFAULT_SYNC_CONFIG,
  EmailContentSyncEngine,
  type HydrationResult,
} from './engine';
import { EmailContentStore } from './store';

/**
 * Email-specific wiring for the content cache + sync engine
 * (docs/email-content-cache.md): the per-tab singleton, the seed-on-open
 * helper used by fetchAndCacheThread, and the eviction hooks mutations call.
 */

/** The legacy per-query persistence DB this cache supersedes. */
const LEGACY_PERSIST_DB = 'email-threads-persist-v1';

let store: EmailContentStore | null = null;
let engine: EmailContentSyncEngine | null = null;
let startedForUserId: string | null = null;

function isGoneCode(code: unknown): boolean {
  return (
    code === 'NOT_FOUND' ||
    code === 'GONE' ||
    code === 'FORBIDDEN' ||
    code === 'UNAUTHORIZED'
  );
}

/** Builds the exact InfiniteData shape useThreadQuery caches. */
function toInfiniteData(thread: ApiThread): InfiniteData<ApiThread, number> {
  return { pages: [thread], pageParams: [0] };
}

async function hydrateThread(threadId: string): Promise<HydrationResult> {
  const result = await emailClient.getThread({
    thread_id: threadId,
    offset: 0,
    limit: DEFAULT_THREAD_MESSAGES_LIMIT,
  });

  if (result.isErr()) {
    return result.error.some((e) => isGoneCode(e.code))
      ? { status: 'gone' }
      : { status: 'error' };
  }

  const thread = result.value.thread;
  return {
    status: 'ok',
    data: toInfiniteData(thread),
    hasDrafts: thread.messages.some((m) => m.is_draft),
    size: JSON.stringify(thread).length,
  };
}

async function fetchDeltaPage(args: {
  since: string;
  cursor?: string;
  order: 'asc' | 'desc';
  limit: number;
}) {
  const result = await emailClient.getThreadDelta(args);
  return result.isOk() ? result.value : null;
}

async function fetchReadableLinkIds(): Promise<string[] | null> {
  const result = await emailClient.getLinks();
  return result.isOk() ? result.value.links.map((l) => l.id) : null;
}

/**
 * Starts (or restarts, on user change) the per-tab engine. Called from
 * QuerySyncProvider once the logged-in user id is known. No-op when the
 * feature flag is off or IndexedDB is unavailable.
 */
export async function startEmailContentSync(userId: string): Promise<void> {
  if (!ENABLE_EMAIL_CONTENT_SYNC) return;
  if (startedForUserId === userId && engine?.isStarted) return;

  stopEmailContentSync();

  try {
    // The legacy per-query store is bypassed under the flag; its orphaned
    // entries would otherwise linger forever.
    indexedDB.deleteDatabase(LEGACY_PERSIST_DB);
    void navigator.storage?.persist?.().catch(() => {});

    const nextStore = new EmailContentStore();
    await nextStore.open(userId);

    const nextEngine = new EmailContentSyncEngine(
      {
        store: nextStore,
        fetchDelta: fetchDeltaPage,
        fetchThread: hydrateThread,
        fetchReadableLinkIds,
        now: () => Date.now(),
        isVisible: () => document.visibilityState === 'visible',
      },
      DEFAULT_SYNC_CONFIG
    );

    store = nextStore;
    engine = nextEngine;
    startedForUserId = userId;
    await nextEngine.start();
  } catch (err) {
    console.error('[email-content-cache] failed to start', err);
    stopEmailContentSync();
  }
}

export function stopEmailContentSync(): void {
  engine?.stop();
  store?.close();
  engine = null;
  store = null;
  startedForUserId = null;
}

/** Wake the engine when the tab becomes visible or the socket reconnects. */
export function wakeEmailContentSync(reason: string): void {
  engine?.wake(reason);
}

/**
 * Routes the steady-state `refresh_email` events into the engine. Events
 * with a `thread_id` get targeted treatment; the delta feed remains the
 * correctness backstop for everything else.
 */
export function handleEmailContentSyncEvent(
  event:
    | {
        event: 'upsert_message' | 'update_labels';
        link_id: string;
        thread_id?: string | null;
      }
    | { event: 'delete_message'; link_id: string; thread_id?: string | null }
): void {
  if (!engine) return;

  if (event.event === 'delete_message') {
    if (event.thread_id) {
      // Re-verify instead of blind-dropping: partial deletes leave the
      // thread alive, and the hydration 404s when it's fully gone.
      engine.markThreadChanged(event.thread_id, event.link_id);
    } else {
      void engine.onUntargetedDelete(event.link_id);
    }
  } else if (event.thread_id) {
    engine.markThreadChanged(event.thread_id, event.link_id);
  }

  engine.wake(event.event);
}

/** Backfill gate: the engine pauses while any link is backfilling. */
export function setEmailContentSyncBackfill(
  linkId: string,
  active: boolean
): void {
  engine?.setBackfillActive(linkId, active);
}

export function onEmailContentSyncLinkRemoved(linkId: string): void {
  void engine?.dropLink(linkId);
}

/**
 * Mutation-facing cache hooks. Fire-and-forget by design: they are
 * correctness aids for the cache, never part of the mutation's critical
 * path. No-ops when the engine isn't running (nothing is served from the
 * cache then either, except the brief window before start — during which
 * draft threads are already excluded from serving by `hasDrafts`).
 */
export const emailContentCache = {
  /** Draft save/delete, send: the cached snapshot is no longer trustworthy. */
  evictThread(threadId: string): void {
    void store?.evictThread(threadId, Date.now()).catch(() => {});
  },
  /** The thread is gone on the server (open path saw a 404/410). */
  deleteThread(threadId: string): void {
    void engine?.dropThread(threadId).catch(() => {});
  },
  /** Mirror an optimistic archive into the cached pages. */
  patchThreadFlags(
    threadId: string,
    patch: Partial<{ inbox_visible: boolean; is_read: boolean }>
  ): void {
    void store?.patchThreadFlags(threadId, patch).catch(() => {});
  },
};

export type SeedOutcome = 'fresh' | 'stale-seeded' | 'none';

/**
 * Seeds the thread query from L2 before an open. Returns:
 * - `'fresh'` — the seed is provably current (hydrated, no drafts, engine
 *   synced recently); the caller can complete the open with zero network.
 * - `'stale-seeded'` — data was seeded but must be revalidated; the caller
 *   awaits the network as usual and may fall back to the seed on failure.
 * - `'none'` — nothing usable; today's network path applies.
 *
 * The seed aborts if the query already has data or a fetch in flight — the
 * resident query cache always wins.
 */
export async function trySeedThreadFromContentCache(
  threadId: string
): Promise<SeedOutcome> {
  if (!ENABLE_EMAIL_CONTENT_SYNC || !engine || !store) return 'none';

  const digest = engine.getDigest(threadId);
  if (!digest || digest.hasDrafts) return 'none';

  const queryKey = emailKeys.threadMessages(threadId).queryKey;
  const state = queryClient.getQueryState(queryKey);
  if (state && (state.data !== undefined || state.fetchStatus === 'fetching')) {
    return 'none';
  }

  let entry: Awaited<ReturnType<EmailContentStore['getEntry']>>;
  try {
    entry = await store.getEntry(threadId);
  } catch {
    return 'none';
  }
  if (!entry || entry.hydratedAt <= digest.evictedAt) return 'none';

  // Re-check the race: a fetch can have resolved during the IDB read.
  const current = queryClient.getQueryState(queryKey);
  if (
    current &&
    (current.data !== undefined || current.fetchStatus === 'fetching')
  ) {
    return 'none';
  }

  const provablyFresh =
    digest.state === 'hydrated' &&
    Date.now() - engine.lastSyncCompletedAt < DEFAULT_SYNC_CONFIG.freshWindowMs;

  queryClient.setQueryData(queryKey, entry.data, {
    updatedAt: provablyFresh ? Date.now() : entry.hydratedAt,
  });
  return provablyFresh ? 'fresh' : 'stale-seeded';
}
