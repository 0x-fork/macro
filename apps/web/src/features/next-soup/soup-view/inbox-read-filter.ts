import type { QueryState } from '@app/features/next-soup/filters/filter-store';

/** Unread/read/all filter for the new inbox ('all' leaves the query as-is). */
export type ReadFilter = 'all' | 'unread' | 'read';

/**
 * Injects the new inbox's per-entity-type seen filters into a query.
 *
 * The Default tab keeps documents and chats out of this: its "my work" half
 * (docs and agents the user owns) usually carries no notifications, and the
 * seen filter compiles to an EXISTS over notifications server-side — applying
 * it would silently drop every self-created doc and agent from the feed. The
 * tab's or-predicates narrow those rows client-side instead.
 */
export function withInboxReadFilter(
  state: QueryState,
  opts: { filter: ReadFilter; tab: string | undefined }
): QueryState {
  if (opts.filter === 'all') return state;
  const seen = opts.filter === 'read';
  const keepDocsAndChats = opts.tab === 'default';
  return {
    ...state,
    include: {
      ...state.include,
      ...(keepDocsAndChats ? {} : { documentSeen: seen, chatSeen: seen }),
      emailSeen: seen,
      channelSeen: seen,
      folderSeen: seen,
      foreignEntitySeen: seen,
    },
  };
}
