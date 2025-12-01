import { DEFAULT_THREAD_MESSAGES_LIMIT } from '@core/constant/pagination';
import {
  getThread,
  type GetThreadResponse,
  type ApiThread,
} from '@service-email/client';

/**
 * Thread cache item - stores full thread data including messages
 */
export type CachedThread = ApiThread & {
  /** When this thread was last fetched */
  _fetchedAt: number;
};

// Simple in-memory cache for threads
const threadCache = new Map<string, CachedThread>();

/**
 * Get a thread from the cache without fetching.
 * Returns undefined if not in cache.
 */
export function getCachedThread(threadId: string): ApiThread | undefined {
  return threadCache.get(threadId);
}

/**
 * Fetch a thread and add it to the cache.
 * Returns the cached version if available and not stale.
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
  const staleTime = options?.staleTime ?? 5 * 60 * 1000; // 5 minutes default

  // Check cache first
  if (!options?.forceRefresh) {
    const cached = threadCache.get(threadId);
    if (cached) {
      const age = Date.now() - cached._fetchedAt;
      if (age < staleTime) {
        // Return cached data
        console.log(`[ThreadCache] HIT for ${threadId} (age: ${Math.round(age / 1000)}s)`);
        return { thread: cached };
      }
      console.log(`[ThreadCache] STALE for ${threadId} (age: ${Math.round(age / 1000)}s)`);
    }
  }

  // Fetch from server
  console.log(`[ThreadCache] MISS for ${threadId}, fetching from server...`);
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
    return undefined;
  }

  // Update cache
  const cachedThread: CachedThread = {
    ...data.thread,
    _fetchedAt: Date.now(),
  };
  threadCache.set(threadId, cachedThread);

  return data;
}

/**
 * Update a thread in the cache (e.g., after loading more messages or refresh)
 */
export function updateCachedThread(
  threadId: string,
  updater: (thread: CachedThread) => CachedThread
): void {
  const cached = threadCache.get(threadId);
  if (cached) {
    threadCache.set(threadId, updater(cached));
  }
}

/**
 * Invalidate a cached thread (force re-fetch on next access)
 */
export function invalidateCachedThread(threadId: string): void {
  threadCache.delete(threadId);
}

/**
 * Clear all cached threads
 */
export function clearThreadCache(): void {
  threadCache.clear();
}

/**
 * Get cache stats for debugging
 */
export function getThreadCacheStats(): { size: number; threadIds: string[] } {
  return {
    size: threadCache.size,
    threadIds: Array.from(threadCache.keys()),
  };
}
