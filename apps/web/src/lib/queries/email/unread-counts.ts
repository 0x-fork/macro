import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { emailClient } from '@service-email/client';
import { useQuery } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import { emailKeys } from './keys';

/**
 * How long a fetched count stays fresh. Short, because the badge is a
 * "there is something waiting" signal — a stale one is worse than a late one.
 */
const UNREAD_COUNTS_STALE_TIME = 30 * 1000;

/**
 * Background refresh cadence. Mail arriving from the provider doesn't
 * invalidate this query (the notification-driven soup refresh doesn't know
 * about it), so a poll is what turns new mail into a badge while the tab
 * stays open. Reads and unreads made in-app invalidate directly and don't
 * wait for it.
 */
const UNREAD_COUNTS_REFETCH_INTERVAL = 60 * 1000;

const queryEnabled = () => true;

/**
 * Unread Signal-view thread counts per connected inbox, as the sidebar's Email
 * badge renders them. Counts are Signal only — Noise is deliberately excluded,
 * so the number always matches the tab a click lands on.
 *
 * The server returns one entry per accessible inbox, including inboxes with
 * nothing unread, so an inbox missing from the response means "not linked"
 * rather than "caught up".
 */
export function useEmailUnreadCountsQuery(
  enabled: Accessor<boolean> = queryEnabled
) {
  return useQuery(() => ({
    queryKey: emailKeys.unreadCounts.queryKey,
    queryFn: async () =>
      throwOnErr(async () => await emailClient.getUnreadCounts()),
    enabled: enabled(),
    staleTime: UNREAD_COUNTS_STALE_TIME,
    refetchInterval: UNREAD_COUNTS_REFETCH_INTERVAL,
    refetchOnWindowFocus: 'always' as const,
  }));
}

/**
 * Unread Signal counts keyed by email link id, plus the cross-inbox total the
 * collapsed Email row shows. Both are `0`-safe before the query resolves, so
 * the badge simply doesn't render rather than flashing a placeholder.
 */
export function useEmailUnreadCounts(enabled?: Accessor<boolean>) {
  const query = useEmailUnreadCountsQuery(enabled);

  const byLinkId = createMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of query.data?.counts ?? []) {
      counts.set(entry.link_id, entry.unread_count);
    }
    return counts;
  });

  return {
    /** Unread Signal count for one inbox; `0` while the query is loading. */
    forLink: (linkId: string) => byLinkId().get(linkId) ?? 0,
    /** Unread Signal count summed across every connected inbox. */
    total: () => query.data?.total ?? 0,
  };
}

/** Refetch the unread counts — call after anything that reads or unreads mail. */
export function invalidateEmailUnreadCounts() {
  queryClient.invalidateQueries({
    queryKey: emailKeys.unreadCounts.queryKey,
  });
}
