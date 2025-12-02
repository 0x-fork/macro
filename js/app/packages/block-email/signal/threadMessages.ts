import { createBlockResource } from '@core/block';
import { DEFAULT_THREAD_MESSAGES_LIMIT } from '@core/constant/pagination';
import { logger } from '@observability/logger';
import {
  type GetThreadResponse,
  getThread,
  type Thread,
} from '@service-email/client';
import { reconcile } from 'solid-js/store';
import { updateCachedThread } from '../collections/threadCollection';

export type ThreadMessagesFetchResult = {
  thread: Thread;
  hasMore: boolean;
};

const fetchThreadMessages = async (
  threadId: string,
  {
    value,
    refetching,
  }: {
    value?: ThreadMessagesFetchResult;
    refetching?: boolean | { offset?: number };
  }
): Promise<ThreadMessagesFetchResult> => {
  const offset =
    refetching && typeof refetching === 'object' && refetching.offset
      ? refetching.offset
      : 0;

  const { data, error } = await getThread({
    path: { id: threadId },
    query: {
      offset,
      limit: DEFAULT_THREAD_MESSAGES_LIMIT,
    },
  });

  // Note: OpenAPI spec incorrectly defines this as Array<GetThreadResponse>
  // but the actual API returns GetThreadResponse directly (single object)
  const threadData = data as unknown as GetThreadResponse | undefined;

  if (error || !threadData?.thread) {
    logger.error(`Failed to get email thread messages: ${error}`);
    throw new Error(`Failed to get email thread messages: ${error}`);
  }

  const newMessages = threadData.thread.messages ?? [];

  const existingMessages = offset > 0 && value ? value.thread.messages : [];
  const allMessages = [...existingMessages, ...newMessages];

  const hasMore = newMessages.length === DEFAULT_THREAD_MESSAGES_LIMIT;

  return {
    thread: {
      ...threadData.thread,
      messages: allMessages,
    },
    hasMore,
  };
};

export const createThreadMessagesResource = (
  threadId: string,
  initialThread?: Thread
) => {
  // Create initial data from the thread if provided
  const initialData: ThreadMessagesFetchResult | undefined = initialThread
    ? {
        thread: initialThread,
        hasMore: initialThread.messages.length >= DEFAULT_THREAD_MESSAGES_LIMIT,
      }
    : undefined;

  const [resource, { mutate, refetch }] = createBlockResource(
    () => threadId,
    fetchThreadMessages,
    { initialValue: initialData }
  );

  const loadMore = () => {
    const currentData = resource();
    if (currentData && currentData.hasMore && !resource.loading) {
      const nextOffset = currentData.thread.messages.length;
      refetch({ offset: nextOffset });
    }
  };

  const refresh = async () => {
    const { data: freshData, error } = await getThread({
      path: { id: threadId },
      query: {
        offset: 0,
        limit: DEFAULT_THREAD_MESSAGES_LIMIT,
      },
    });

    // Note: OpenAPI spec incorrectly defines this as Array<GetThreadResponse>
    // but the actual API returns GetThreadResponse directly (single object)
    const threadData = freshData as unknown as GetThreadResponse | undefined;

    if (error || !threadData?.thread) {
      logger.error(`Failed to refresh email thread messages: ${error}`);
      return;
    }
    const currentData = resource();
    if (!currentData) {
      refetch({ offset: 0 });
      return;
    }

    // We need to manually reconcile messages in the thread, to maintain
    // referential stability across updates. Without this solid will treat all the messages as new,
    // re-render all of them, which will cause a flicker. With this only the new messages will be added.
    mutate((prev) => {
      if (!prev) return prev;

      return {
        ...prev,
        thread: {
          ...threadData.thread,
          messages: reconcile(threadData.thread.messages, {
            key: 'db_id',
            merge: false, // Don't merge partial updates, replace entirely
          })(prev.thread.messages),
        },
        hasMore:
          threadData.thread.messages.length >= DEFAULT_THREAD_MESSAGES_LIMIT,
      };
    });

    // Update the thread collection cache with fresh data
    updateCachedThread(threadId, () => threadData.thread);
  };

  return {
    resource,
    mutate,
    loadMore,
    refresh,
    loading: () => resource.loading,
  };
};
