import {
  type ParsedDuration,
  parsedDurationToMilliseconds,
} from '@core/util/dateSearch/dateParser';
import {
  hashKey,
  type Query,
  type QueryCacheNotifyEvent,
  type QueryKey,
} from '@tanstack/query-core';
import type {
  PerQueryPersistence,
  PersistedQueryEntry,
} from './persistence/per-query-idb';

export type PersistenceKey = `${string}-persist-v${number}`;

/** Builds a versioned persistence key for IDB database naming. */
export function createPersistenceKey(
  name: string,
  version: number
): PersistenceKey {
  return `${name}-persist-v${version}`;
}

export type PersistScope = Readonly<{
  store: PerQueryPersistence;
  maxAge: ParsedDuration;
  buster: string;
  shouldPersist: (queryKey: QueryKey) => boolean;
  shouldRestore?: (queryKey: QueryKey) => boolean;
  /**
   * Transforms query data before it is written to the store. Return
   * `undefined` to skip persisting that update entirely (e.g. transient
   * mid-pagination slices). When omitted, data is persisted as-is.
   */
  dehydrate?: (queryKey: QueryKey, data: unknown) => unknown;
  /**
   * Whether removing a query from the in-memory cache (including gcTime
   * eviction) also deletes its persisted entry. Defaults to true. Scopes
   * that cache content for cold starts should set this to false, since
   * their queries are routinely garbage-collected minutes after unmount;
   * expiry is then handled by maxAge, the buster, and the startup sweep.
   */
  evictOnRemoval?: boolean;
}>;

type QueryClientLike = {
  getQueryCache: () => {
    subscribe: (listener: (event: QueryCacheNotifyEvent) => void) => () => void;
  };
  getQueryState: (
    queryKey: QueryKey
  ) => { status: string; data: unknown; dataUpdatedAt: number } | undefined;
  setQueryData: (
    queryKey: QueryKey,
    data: unknown,
    options?: { updatedAt?: number }
  ) => void;
};

/**
 * Validates a persisted entry against the current cache-buster and max age.
 * Returns 'valid' if the entry can be restored, or a reason string
 * explaining why it should be discarded.
 */
function validatePersistedEntry(
  entry: PersistedQueryEntry,
  buster: string,
  maxAgeMs: number
): 'valid' | 'buster_mismatch' | 'expired' {
  if (entry.buster !== buster) return 'buster_mismatch';
  if (Date.now() - entry.dataUpdatedAt > maxAgeMs) return 'expired';
  return 'valid';
}

/**
 * Reads a scope's persisted entry by hash and validates it against the
 * scope's buster and max age. Invalid entries are deleted and not returned.
 */
async function getValidPersistedEntry(
  scope: PersistScope,
  queryHash: string
): Promise<PersistedQueryEntry | undefined> {
  let entry: PersistedQueryEntry | undefined;
  try {
    entry = await scope.store.get(queryHash);
  } catch {
    console.error('[query] IDB persistence read failed');
    return undefined;
  }
  if (!entry) return undefined;

  const maxAgeMs = parsedDurationToMilliseconds(scope.maxAge);
  if (validatePersistedEntry(entry, scope.buster, maxAgeMs) !== 'valid') {
    scope.store.remove(queryHash);
    return undefined;
  }
  return entry;
}

/**
 * Attempts to restore a query's data from IDB when the query is first added
 * to the cache. Validates the entry and guards against race conditions where
 * a fresh fetch resolves before the IDB read completes.
 */
async function handleRestore(
  queryClient: QueryClientLike,
  scope: PersistScope,
  query: Query
): Promise<void> {
  if (scope.shouldRestore && !scope.shouldRestore(query.queryKey)) return;

  const state = queryClient.getQueryState(query.queryKey);
  if (state && state.status === 'success') return;

  const entry = await getValidPersistedEntry(scope, query.queryHash);
  if (!entry) return;

  const current = queryClient.getQueryState(query.queryKey);
  if (current && current.status === 'success') return;

  queryClient.setQueryData(query.queryKey, entry.data, {
    updatedAt: entry.dataUpdatedAt,
  });
}

/**
 * Persists a query's current data to IDB when the query updates successfully.
 */
function handleUpdate(scope: PersistScope, query: Query): void {
  if (query.state.status !== 'success') return;
  const data = scope.dehydrate
    ? scope.dehydrate(query.queryKey, query.state.data)
    : query.state.data;
  if (data === undefined) return;
  scope.store.set({
    queryHash: query.queryHash,
    queryKey: query.queryKey,
    data,
    dataUpdatedAt: query.state.dataUpdatedAt,
    persistedAt: Date.now(),
    buster: scope.buster,
  });
}

/**
 * Reads a persisted entry for a query key directly from the first matching
 * scope, bypassing the query cache. Used by imperative load paths (e.g.
 * opening a document while offline) that need cached data even when no
 * query observer exists. Invalid entries are deleted and not returned.
 */
export async function readPersistedQueryData<T>(
  scopes: readonly PersistScope[],
  queryKey: QueryKey
): Promise<T | undefined> {
  const scope = scopes.find((s) => s.shouldPersist(queryKey));
  if (!scope) return undefined;
  if (scope.shouldRestore && !scope.shouldRestore(queryKey)) return undefined;

  const entry = await getValidPersistedEntry(scope, hashKey(queryKey));
  return entry?.data as T | undefined;
}

/**
 * Generic dehydrate for infinite queries: persists only the first
 * `maxPages` pages (with their pageParams) so long pagination sessions
 * don't balloon the store. Non-infinite data passes through unchanged.
 */
export function trimInfiniteQueryPages(
  maxPages: number
): (queryKey: QueryKey, data: unknown) => unknown {
  return (_queryKey, data) => {
    if (typeof data !== 'object' || data === null) return data;
    const infinite = data as { pages?: unknown[]; pageParams?: unknown[] };
    if (!Array.isArray(infinite.pages) || !Array.isArray(infinite.pageParams))
      return data;
    if (infinite.pages.length <= maxPages) return data;
    return {
      pages: infinite.pages.slice(0, maxPages),
      pageParams: infinite.pageParams.slice(0, maxPages),
    };
  };
}

/** Delay before sweeping stores so the sweep stays off the startup path. */
const SWEEP_DELAY_MS = 15_000;

/**
 * Deletes expired and buster-mismatched entries from the stores of scopes
 * with `evictOnRemoval: false`, whose entries are otherwise only deleted
 * when an invalid entry happens to be read. Evicting scopes are skipped:
 * their stores stay closed unless the session actually uses them.
 */
function sweepPersistScopes(scopes: readonly PersistScope[]): void {
  for (const scope of scopes) {
    if (scope.evictOnRemoval ?? true) continue;
    const maxAgeMs = parsedDurationToMilliseconds(scope.maxAge);
    scope.store
      .sweep?.(
        (entry) =>
          validatePersistedEntry(entry, scope.buster, maxAgeMs) === 'valid'
      )
      .catch((err) => {
        console.error('[query] IDB persistence sweep failed', err);
      });
  }
}

/**
 * Sets up per-query persistence: individual queries are persisted to
 * and restored from IDB independently, rather than serializing the entire
 * query cache as one blob.
 *
 * - On 'added': restores cached data from IDB if the query has no fresh data.
 * - On 'updated': writes the query's successful data to IDB.
 * - On 'removed': deletes the query's entry from IDB (unless the scope opts
 *   out via `evictOnRemoval: false`).
 *
 * Returns an unsubscribe function to stop listening.
 */
export function setupQueryPersistence(
  params: Readonly<{
    queryClient: QueryClientLike;
    scopes: readonly PersistScope[];
  }>
): () => void {
  const { queryClient, scopes } = params;

  const findScope = (queryKey: QueryKey) =>
    scopes.find((s) => s.shouldPersist(queryKey));

  const flushAll = () => {
    for (const scope of scopes) {
      void scope.store.flush();
    }
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flushAll();
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  const sweepTimer = setTimeout(
    () => sweepPersistScopes(scopes),
    SWEEP_DELAY_MS
  );

  const cacheUnsubscribe = queryClient.getQueryCache().subscribe((event) => {
    const { type } = event;
    if (type !== 'added' && type !== 'updated' && type !== 'removed') return;

    const { query } = event;
    const scope = findScope(query.queryKey);
    if (!scope) return;

    if (type === 'added') {
      handleRestore(queryClient, scope, query).catch((err) => {
        console.error('[query] IDB restore failed', err);
      });
    } else if (type === 'updated') {
      handleUpdate(scope, query);
    } else if (scope.evictOnRemoval ?? true) {
      scope.store.remove(query.queryHash);
    }
  });

  return () => {
    clearTimeout(sweepTimer);
    cacheUnsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
