import { DEFAULT_THREAD_MESSAGES_LIMIT } from '@core/constant/pagination';
import { queryClient, queryKeys } from '@macro-entity';
import {
  type ApiThread,
  type GetThreadResponse,
  getThread,
} from '@service-email/client';

const THREAD_STALE_TIME = 5 * 60 * 1000; // 5 minutes

/**
 * Pure fetch function for a thread.
 * This is the queryFn for TanStack Query.
 */
const fetchThread = async (threadId: string): Promise<GetThreadResponse> => {
  const result = await getThread({
    path: { id: threadId },
    query: {
      offset: 0,
      limit: DEFAULT_THREAD_MESSAGES_LIMIT,
    },
  });

  // Note: OpenAPI spec incorrectly defines this as Array<GetThreadResponse>
  // but the actual API returns GetThreadResponse directly (single object)
  const data = result.data as unknown as GetThreadResponse | undefined;

  if (result.error || !data?.thread) {
    throw new Error('Failed to fetch thread');
  }

  return data;
};

/**
 * Get a thread from the cache without fetching.
 * Returns undefined if not in cache.
 */
export function getCachedThread(threadId: string): ApiThread | undefined {
  const data = queryClient.getQueryData<GetThreadResponse>(
    queryKeys.thread({ threadId })
  );
  return data?.thread;
}

/**
 * Fetch a thread using TanStack Query's cache.
 * Returns cached data if fresh, otherwise fetches from server.
 *
 * @param threadId - The thread ID to fetch
 * @param options - Fetch options
 * @returns The thread data or undefined if fetch failed
 */
export async function fetchAndCacheThread(
  threadId: string,
  options?: {
    /** Force refresh even if cached */
    forceRefresh?: boolean;
    /** Max age in ms before considering stale (default: 5 minutes) */
    staleTime?: number;
  }
): Promise<GetThreadResponse | undefined> {
  const staleTime = options?.staleTime ?? THREAD_STALE_TIME;

  try {
    if (options?.forceRefresh) {
      // Force refetch by invalidating first
      await queryClient.invalidateQueries({
        queryKey: queryKeys.thread({ threadId }),
      });
    }

    const data = await queryClient.fetchQuery({
      queryKey: queryKeys.thread({ threadId }),
      queryFn: () => fetchThread(threadId),
      staleTime,
    });

    return data;
  } catch {
    return undefined;
  }
}

/**
 * Update a thread in the cache (e.g., after loading more messages or refresh)
 */
export function updateCachedThread(
  threadId: string,
  updater: (thread: ApiThread) => ApiThread
): void {
  queryClient.setQueryData<GetThreadResponse>(
    queryKeys.thread({ threadId }),
    (old: GetThreadResponse | undefined) => {
      if (!old?.thread) return old;
      return { thread: updater(old.thread) };
    }
  );
}

/**
 * Invalidate a cached thread (force re-fetch on next access)
 */
export function invalidateCachedThread(threadId: string): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.thread({ threadId }),
  });
}

/**
 * Clear all cached threads
 */
export function clearThreadCache(): void {
  queryClient.invalidateQueries({
    queryKey: queryKeys.all.email,
  });
}

/**
 * Get cache stats for debugging
 */
export function getThreadCacheStats(): { size: number; threadIds: string[] } {
  const queries = queryClient.getQueriesData<GetThreadResponse>({
    queryKey: queryKeys.all.email,
  });

  const threadIds = queries
    .filter(
      ([key]: [readonly unknown[], GetThreadResponse | undefined]) =>
        Array.isArray(key) && key.includes('thread')
    )
    .map(([key]: [readonly unknown[], GetThreadResponse | undefined]) => {
      const opts = key.find(
        (k: unknown): k is { threadId: string } =>
          typeof k === 'object' && k !== null && 'threadId' in k
      );
      return opts?.threadId;
    })
    .filter((id: string | undefined): id is string => !!id);

  return {
    size: threadIds.length,
    threadIds,
  };
}
