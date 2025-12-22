import { persistQueryClient } from '@tanstack/query-persist-client-core';
import type { Persister, QueryKey } from '@tanstack/query-persist-client-core';
import type { QueryClient } from '@tanstack/solid-query';
import type { Query } from '@tanstack/query-core';

export type PersistScope = Readonly<{
  /**
   * Storage namespace for this scope.
   * Changing this will effectively "fork" persisted data.
   */
  storageKey: string;
  persister: Persister;
  maxAgeMs: number;
  shouldDehydrateQuery: (query: Query) => boolean;
}>;

export function queryKeyHasPrefix(
  key: QueryKey,
  prefix: readonly unknown[]
): boolean {
  if (!Array.isArray(key)) return false;
  if (prefix.length > key.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (key[i] !== prefix[i]) return false;
  }
  return true;
}

export function setupQueryPersistence(params: Readonly<{
  queryClient: QueryClient;
  buster: string;
  scopes: readonly PersistScope[];
}>) {
  if (typeof window === 'undefined') return;
  if (!('indexedDB' in window)) return;

  for (const scope of params.scopes) {
    try {
      persistQueryClient({
        queryClient: params.queryClient,
        persister: scope.persister,
        maxAge: scope.maxAgeMs,
        buster: params.buster,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' && scope.shouldDehydrateQuery(q),
        },
      });
    } catch {
      // Best-effort: don't break app if storage is blocked/quota'd/etc.
    }
  }
}


