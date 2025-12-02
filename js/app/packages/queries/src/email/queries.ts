import { DEFAULT_THREAD_MESSAGES_LIMIT } from '@core/constant/pagination';
import { useInfiniteQuery, useQuery } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import { createApiTokenQuery } from '../auth';
import { queryClient } from '../client';
import {
  type ApiSortMethod,
  type ApiThread,
  type GetThreadResponse,
  type PreviewViewStandardLabel,
  getThread,
  previewsInboxCursor,
} from './client';
import { emailKeys } from './keys';

// Email entity type
export type EmailEntity = {
  type: 'email';
  id: string;
  name: string;
  ownerId: string;
  frecencyScore?: number;
  createdAt?: number;
  updatedAt?: number;
  viewedAt?: number;
  isRead: boolean;
  snippet?: string;
  isImportant: boolean;
  done: boolean;
  participantEmails?: string[];
  participantNames?: string[];
  senderEmail?: string;
  senderName?: string;
};

// Thread queries

/**
 * Fetch a thread from the API.
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
 * Query hook for fetching a single thread.
 */
export function createThreadQuery(threadId: string) {
  return useQuery(() => ({
    ...emailKeys.thread(threadId),
    queryFn: () => fetchThread(threadId),
  }));
}

/**
 * Imperatively fetch a thread (for use outside of components).
 * Returns cached data if fresh, otherwise fetches from server.
 */
export async function fetchAndCacheThread(
  threadId: string,
  options?: {
    forceRefresh?: boolean;
    staleTime?: number;
  }
): Promise<GetThreadResponse | undefined> {
  const staleTime = options?.staleTime ?? 5 * 60 * 1000;

  try {
    if (options?.forceRefresh) {
      await queryClient.invalidateQueries({
        queryKey: emailKeys.thread(threadId).queryKey,
      });
    }

    return await queryClient.fetchQuery({
      ...emailKeys.thread(threadId),
      queryFn: () => fetchThread(threadId),
      staleTime,
    });
  } catch {
    return undefined;
  }
}

/**
 * Get a thread from cache without fetching.
 */
export function getCachedThread(threadId: string): ApiThread | undefined {
  const data = queryClient.getQueryData<GetThreadResponse>(
    emailKeys.thread(threadId).queryKey
  );
  return data?.thread;
}

/**
 * Update a thread in the cache.
 */
export function updateCachedThread(
  threadId: string,
  updater: (thread: ApiThread) => ApiThread
): void {
  queryClient.setQueryData<GetThreadResponse>(
    emailKeys.thread(threadId).queryKey,
    (old: GetThreadResponse | undefined) => {
      if (!old?.thread) return old;
      return { thread: updater(old.thread) };
    }
  );
}

/**
 * Invalidate a cached thread.
 */
export function invalidateCachedThread(threadId: string): void {
  queryClient.invalidateQueries({
    queryKey: emailKeys.thread(threadId).queryKey,
  });
}

/**
 * Invalidate all email queries.
 */
export function invalidateAllEmailQueries(): void {
  queryClient.invalidateQueries({
    queryKey: emailKeys.all.queryKey,
  });
}

// Email previews (infinite list) queries

type PreviewsInboxCursorParams = {
  limit?: number;
  cursor?: string;
  sort_method?: ApiSortMethod;
};

export type FetchPaginatedEmailsParams = PreviewsInboxCursorParams & {
  view: PreviewViewStandardLabel;
};

const fetchPaginatedEmails = async ({
  view,
  ...params
}: FetchPaginatedEmailsParams) => {
  const { data, error } = await previewsInboxCursor({
    path: { view },
    query: params,
  });

  if (error || !data) {
    throw new Error('Failed to fetch email', { cause: error });
  }

  return data;
};

export function createEmailsInfiniteQuery(
  args?: Accessor<FetchPaginatedEmailsParams>,
  options?: {
    refetchInterval?: Accessor<number | undefined>;
    disabled?: Accessor<boolean>;
  }
) {
  const params = () => {
    const argParams = args?.();
    const limit =
      argParams?.limit && argParams.limit > 0 && argParams.limit <= 500
        ? argParams.limit
        : 500;
    const view = argParams?.view ?? 'all';
    return {
      ...argParams,
      limit,
      view,
    };
  };

  const authQuery = createApiTokenQuery();
  const enabled = createMemo(
    () => authQuery.isSuccess && !options?.disabled?.()
  );

  return useInfiniteQuery(() => {
    return {
      ...emailKeys.previews(params()),
      queryFn: ({ pageParam }) => fetchPaginatedEmails(pageParam),
      initialPageParam: params(),
      getNextPageParam: ({ next_cursor: cursor }) =>
        cursor ? { ...params(), cursor } : undefined,
      select: (data) =>
        data.pages.flatMap(({ items }) =>
          items.map((email): EmailEntity => {
            const participantEmails = email.contacts.map(
              (p) => p.emailAddress ?? ''
            );
            const participantNames = email.contacts.map((p) => p.name ?? '');

            return {
              ...email,
              type: 'email',
              name: email.name || 'No Subject',
              frecencyScore: email.frecencyScore ?? undefined,
              viewedAt: email.viewedAt ?? undefined,
              snippet: email.snippet ?? undefined,
              isImportant: email.isImportant ?? false,
              done: !email.inboxVisible,
              participantEmails,
              participantNames,
              senderEmail: email.senderEmail ?? undefined,
              senderName: email.senderName ?? email.senderEmail ?? undefined,
            };
          })
        ),
      enabled: enabled(),
      refetchInterval: options?.refetchInterval?.(),
    };
  });
}
