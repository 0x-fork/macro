import type { QueryState } from '@app/features/next-soup/filters/filter-store';

/** Unread/read/all filter for the new inbox ('all' leaves the query as-is). */
export type ReadFilter = 'all' | 'unread' | 'read';

/**
 * Injects the new inbox's per-entity-type seen filters into a query.
 *
 * The Default tab keeps documents, chats, and channels out of this: the seen
 * filter compiles to an EXISTS over notifications server-side, and the tab's
 * own activity carries no notifications for the acting user — self-created
 * docs and agents have none at all, and sending a channel/DM message
 * notifies everyone but the sender. Applying it would silently drop that
 * whole "my activity" half from the feed. The tab's or-predicates
 * (inbox/my-work/my-messages) narrow those rows client-side instead.
 */
export function withInboxReadFilter(
  state: QueryState,
  opts: { filter: ReadFilter; tab: string | undefined }
): QueryState {
  if (opts.filter === 'all') return state;
  const seen = opts.filter === 'read';
  const keepActivityTypes = opts.tab === 'default';
  return {
    ...state,
    include: {
      ...state.include,
      ...(keepActivityTypes
        ? {}
        : { documentSeen: seen, chatSeen: seen, channelSeen: seen }),
      emailSeen: seen,
      folderSeen: seen,
      foreignEntitySeen: seen,
    },
  };
}
