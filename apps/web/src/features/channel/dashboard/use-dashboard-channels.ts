/**
 * Reactive state for the channels dashboard. The tile set is seeded once when
 * the channel list (and notifications) finish loading, then only changes
 * through explicit user actions — tiles must not reshuffle or vanish while
 * someone is mid-reply just because a channel was marked read.
 */

import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { useChannelsContext } from '@core/context/channels';
import { isChannelNotification } from '@notifications/notification-helpers';
import type { ApiChannelWithLatest } from '@service-storage/channel-list-types';
import { type Accessor, createMemo, createSignal } from 'solid-js';
import {
  DASHBOARD_AUTO_FILL_LIMIT,
  rankDashboardChannels,
  useDashboardPinnedChannels,
} from './dashboard-state';

/** Per-channel count of unread (not viewed, not done) channel notifications. */
function useChannelUnreadCounts(): Accessor<ReadonlyMap<string, number>> {
  const notificationSource = useGlobalNotificationSource();
  return createMemo(() => {
    const counts = new Map<string, number>();
    for (const notification of notificationSource.notifications()) {
      if (!isChannelNotification(notification)) continue;
      if (notification.viewed_at || notification.done) continue;
      counts.set(
        notification.entity_id,
        (counts.get(notification.entity_id) ?? 0) + 1
      );
    }
    return counts;
  });
}

function channelActivityAt(channel: ApiChannelWithLatest) {
  return channel.latest_message?.created_at ?? channel.updated_at;
}

export function createChannelsDashboard() {
  const channelsContext = useChannelsContext();
  const notificationSource = useGlobalNotificationSource();
  const unreadCounts = useChannelUnreadCounts();
  const { pinnedChannelIds, isPinned, togglePinned, unpin } =
    useDashboardPinnedChannels();

  const isLoading = () =>
    channelsContext.isLoading() || notificationSource.isLoading();

  // Latches the ranked seed on the first computation where data is ready;
  // afterwards it returns the previous value without touching any reactive
  // sources, so later unread/pin changes can't reorder the open dashboard.
  const seededIds = createMemo<string[] | undefined>((prev) => {
    if (prev) return prev;
    if (isLoading()) return undefined;
    return rankDashboardChannels({
      channels: channelsContext.channels().map((channel) => ({
        id: channel.id,
        activityAt: channelActivityAt(channel),
      })),
      unreadCounts: unreadCounts(),
      pinnedIds: pinnedChannelIds(),
      limit: DASHBOARD_AUTO_FILL_LIMIT,
    });
  }, undefined);

  const [addedIds, setAddedIds] = createSignal<string[]>([]);
  const [removedIds, setRemovedIds] = createSignal<ReadonlySet<string>>(
    new Set()
  );

  const displayedIds = createMemo(() => {
    const seeded = seededIds() ?? [];
    const removed = removedIds();
    const seededSet = new Set(seeded);
    return [
      ...seeded.filter((id) => !removed.has(id)),
      ...addedIds().filter((id) => !removed.has(id) && !seededSet.has(id)),
    ];
  });

  const addChannel = (channelId: string) => {
    setRemovedIds((prev) => {
      if (!prev.has(channelId)) return prev;
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
    setAddedIds((prev) =>
      prev.includes(channelId) ? prev : [...prev, channelId]
    );
  };

  const removeChannel = (channelId: string) => {
    setRemovedIds((prev) => new Set(prev).add(channelId));
    unpin(channelId);
  };

  /** Channels with unread messages that don't currently have a tile. */
  const unreadElsewhere = createMemo(() => {
    const displayed = new Set(displayedIds());
    const counts = unreadCounts();
    const channelsById = channelsContext.channelsById();
    return [...counts.entries()]
      .filter(([id, count]) => count > 0 && !displayed.has(id))
      .map(([id, count]) => ({ channel: channelsById[id], count }))
      .filter(
        (entry): entry is { channel: ApiChannelWithLatest; count: number } =>
          entry.channel != null
      )
      .sort((a, b) => b.count - a.count);
  });

  return {
    isLoading,
    displayedIds,
    addChannel,
    removeChannel,
    isPinned,
    togglePinned,
    unreadCounts,
    unreadElsewhere,
    channels: channelsContext.channels,
  };
}
