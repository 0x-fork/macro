import {
  type ParsedDuration,
  parsedDurationToMilliseconds,
} from '@core/util/dateSearch/dateParser';
import type {
  InfiniteData,
  Query,
  QueryCacheNotifyEvent,
  QueryKey,
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
   * Transforms query data before it is written to the store. Returning
   * `undefined` skips the write, leaving any previously persisted entry in
   * place. Restored data is used as-is (no inverse transform), so the
   * result must be valid data for the query.
   */
  dehydrateData?: (data: unknown) => unknown;
  /**
   * Keeps persisted entries when their query is removed from the cache
   * (garbage collection or `removeQueries`). Use for queries that unmount
   * regularly but should still restore on a later mount; entries are then
   * evicted only by `maxAge` or a `buster` change.
   */
  retainOnRemoval?: boolean;
}>;

export function isInfiniteData(data: unknown): data is InfiniteData<unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as InfiniteData<unknown>).pages) &&
    Array.isArray((data as InfiniteData<unknown>).pageParams)
  );
}

/**
 * Dehydrates `InfiniteData` down to its first page so that only the
 * first (latest) page of an infinite query is persisted.
 *
 * Restoring a single page keeps revalidation cheap: an infinite query
 * refetches every cached page sequentially, so restoring N pages costs N
 * requests on the next refetch and replays cursors that may have expired,
 * while a single restored page revalidates with one request using
 * `pageParams[0]`. Only valid for forward-only pagination, where `pages[0]`
 * is the page fetched with `initialPageParam` — not for bidirectional
 * queries (`getPreviousPageParam`), which can prepend pages. Non-infinite
 * data passes through unchanged.
 */
export function dehydrateFirstPage(data: unknown): unknown {
  if (!isInfiniteData(data) || data.pages.length <= 1) return data;
  return {
    pages: data.pages.slice(0, 1),
    pageParams: data.pageParams.slice(0, 1),
  };
}

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

  let entry: PersistedQueryEntry | undefined;
  try {
    entry = await scope.store.get(query.queryHash);
  } catch {
    console.error('[query] IDB persistence read failed');
    return;
  }

  if (!entry) return;

  const maxAgeMs = parsedDurationToMilliseconds(scope.maxAge);
  if (validatePersistedEntry(entry, scope.buster, maxAgeMs) !== 'valid') {
    scope.store.remove(query.queryHash);
    return;
  }

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
  const data = scope.dehydrateData
    ? scope.dehydrateData(query.state.data)
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
 * Sets up per-query persistence: individual queries are persisted to
 * and restored from IDB independently, rather than serializing the entire
 * query cache as one blob.
 *
 * - On 'added': restores cached data from IDB if the query has no fresh data.
 * - On 'updated': writes the query's successful data to IDB.
 * - On 'removed': deletes the query's entry from IDB, unless the scope sets
 *   `retainOnRemoval`.
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
    } else if (!scope.retainOnRemoval) {
      scope.store.remove(query.queryHash);
    }
  });

  return () => {
    cacheUnsubscribe();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
