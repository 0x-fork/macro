import { QueryClient } from '@tanstack/solid-query';
import { createIDBPersister } from './persist/idbPersister';
import { queryKeyHasPrefix, setupQueryPersistence } from './persist/persist';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

setupQueryPersistence({
  queryClient,
  buster: import.meta.env.__APP_VERSION__ ?? 'dev',
  scopes: [
    {
      persister: createIDBPersister({ key: 'channels-v1' }),
      maxAgeMs: 1000 * 60 * 60 * 24 * 7,
      shouldDehydrateQuery: (q) => queryKeyHasPrefix(q.queryKey, ['channel']),
    },
  ],
});

export function useQueryClient() {
  return queryClient;
}
