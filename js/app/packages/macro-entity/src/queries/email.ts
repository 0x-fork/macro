import {
  type PreviewViewStandardLabel,
  type ApiPaginatedThreadCursor,
  type ApiSortMethod,
  previewsInboxCursor,
} from '@service-email/client';
import { useInfiniteQuery } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import type { EmailEntity } from '../types/entity';
import { createApiTokenQuery } from './auth';
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
