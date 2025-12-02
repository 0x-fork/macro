import {
  type ApiPaginatedThreadCursor,
  type ApiSortMethod,
  type PreviewViewStandardLabel,
  previewsInboxCursor,
} from '@queries';
import {
  type InfiniteData,
  partialMatchKey,
  useInfiniteQuery,
} from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import type { EmailEntity } from '../types/entity';
import { createApiTokenQuery } from './auth';
import { queryClient } from './client';
import { queryKeys } from './key';

type PreviewsInboxCursorParams = {
  limit?: number;
  cursor?: string;
  sort_method?: ApiSortMethod;
};

export type FetchPaginatedEmailsParams = PreviewsInboxCursorParams & {
  // path parameter
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

  // Auth is now handled by the client interceptor
  const authQuery = createApiTokenQuery();
  const enabled = createMemo(
    () => authQuery.isSuccess && !options?.disabled?.()
  );
  return useInfiniteQuery(() => {
    return {
      queryKey: queryKeys.email({ infinite: true, ...params() }),
      queryFn: ({ pageParam }) => fetchPaginatedEmails(pageParam),
      initialPageParam: params(),
      getNextPageParam: ({ next_cursor: cursor }) =>
        cursor ? { ...params(), cursor } : undefined,
      select: (data) =>
        data.pages.flatMap(({ items }) =>
          items.map((email): EmailEntity => {
            const participants = email.contacts.map((p) => ({
              email: p.emailAddress ?? '',
              name: p.name ?? '',
            }));

            return {
              ...email,
              type: 'email',
              name: email.name || 'No Subject',
              frecencyScore: email.frecencyScore ?? undefined,
              viewedAt: email.viewedAt ?? undefined,
              snippet: email.snippet ?? undefined,
              isImportant: email.isImportant ?? false,
              done: !email.inboxVisible,
              participants,
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

export const optimisticMarkEmailAsRead = (emailId: string) => {
  queryClient.setQueriesData(
    {
      predicate(query) {
        return partialMatchKey(
          query.queryKey,
          queryKeys.email({
            infinite: true,
            limit: 100,
            view: 'inbox',
          })
        );
      },
    },
    (
      prev:
        | InfiniteData<ApiPaginatedThreadCursor>
        | ApiPaginatedThreadCursor
        | undefined
    ) => {
      if (!prev) return;

      if ('pageParams' in prev) {
        return {
          ...prev,
          pages: prev.pages.map((p) => ({
            ...p,
            items: p.items.map((item) => {
              if (item.id !== emailId) return item;
              return {
                ...item,
                isRead: true,
              };
            }),
          })),
        };
      }

      return prev.items.map((item) => {
        if (item.id !== emailId) return item;

        return { ...item, isRead: true };
      });
    }
  );
};
