/**
 * State helpers for the channels dashboard: which channels get a tile and in
 * what order. Ranking is a pure function so it can be unit tested; the pinned
 * set is a module-level persisted signal (same mechanism as other sticky view
 * settings) so every consumer sees updates immediately.
 */

import type { DateValue } from '@core/util/date';
import { compareDateDesc } from '@core/util/date';
import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

/** How many tiles the dashboard seeds itself with when unpinned. */
export const DASHBOARD_AUTO_FILL_LIMIT = 6;

export type DashboardRankableChannel = {
  id: string;
  /** Timestamp of the channel's most recent activity, for recency ranking. */
  activityAt: DateValue | null | undefined;
};

const [pinnedChannelIds, setPinnedChannelIds] = makePersisted(
  createSignal<string[]>([]),
  { name: 'macro:pref:channels:dashboard-pinned' }
);

export function useDashboardPinnedChannels() {
  const isPinned = (channelId: string) =>
    pinnedChannelIds().includes(channelId);

  const togglePinned = (channelId: string) => {
    setPinnedChannelIds((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId]
    );
  };

  const unpin = (channelId: string) => {
    setPinnedChannelIds((prev) =>
      prev.includes(channelId) ? prev.filter((id) => id !== channelId) : prev
    );
  };

  return { pinnedChannelIds, isPinned, togglePinned, unpin };
}

/**
 * Picks the channels shown as dashboard tiles: pinned channels first (in
 * pinned order), then channels with unread messages, then the most recently
 * active — filled up to `limit` total (pins beyond the limit all stay).
 */
export function rankDashboardChannels(options: {
  channels: DashboardRankableChannel[];
  unreadCounts: ReadonlyMap<string, number>;
  pinnedIds: string[];
  limit: number;
}): string[] {
  const byId = new Map(
    options.channels.map((channel) => [channel.id, channel])
  );
  const pinned = options.pinnedIds.filter((id) => byId.has(id));
  const pinnedSet = new Set(pinned);

  const rest = options.channels
    .filter((channel) => !pinnedSet.has(channel.id))
    .sort((a, b) => {
      const aHasUnread = (options.unreadCounts.get(a.id) ?? 0) > 0 ? 1 : 0;
      const bHasUnread = (options.unreadCounts.get(b.id) ?? 0) > 0 ? 1 : 0;
      if (aHasUnread !== bHasUnread) return bHasUnread - aHasUnread;
      return compareDateDesc(a.activityAt, b.activityAt);
    });

  const fillCount = Math.max(options.limit - pinned.length, 0);
  return [...pinned, ...rest.slice(0, fillCount).map((channel) => channel.id)];
}
