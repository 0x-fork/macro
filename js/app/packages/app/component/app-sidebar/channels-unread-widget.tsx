import { useSenderName } from '@app/component/app-sidebar/utils';
import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { UserIcon } from '@core/component/UserIcon';
import { compareDateDesc } from '@core/util/date';
import { ContextMenu } from '@kobalte/core/context-menu';
import { openNotification } from '@notifications';
import { isChannelNotification } from '@notifications/notification-helpers';
import type { UnifiedNotification } from '@notifications/types';
import { Avatar, Button, Tooltip } from '@ui';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
} from 'solid-js';

function getChannelInfo(notification: UnifiedNotification): {
  channelName: string | null;
  channelType: string | null;
  isDM: boolean;
} {
  if (!isChannelNotification(notification)) {
    return { channelName: null, channelType: null, isDM: false };
  }

  const meta = notification.notification_metadata;
  const channelType = meta.content.channelType;
  const isDM = channelType === 'directMessage';
  const channelName =
    'channelName' in meta.content ? (meta.content.channelName ?? null) : null;
  return { channelName, channelType, isDM };
}

export interface ChannelGroup {
  entityId: string;
  channelName: string | null;
  channelType: string | null;
  isDM: boolean;
  notifications: UnifiedNotification[];
  latestSenderId: string | null;
}

/**
 * Single-letter (or two-letter on first-letter collisions) avatar labels for
 * non-DM channels, keyed by channel id.
 */
export function computeChannelLetters(
  items: Array<{ id: string; name: string | null; isDM: boolean }>
): Map<string, string> {
  const result = new Map<string, string>();
  const firstLetterCount = new Map<string, number>();

  for (const item of items) {
    if (item.isDM || !item.name) continue;
    const first = item.name[0]?.toUpperCase() ?? '';
    firstLetterCount.set(first, (firstLetterCount.get(first) ?? 0) + 1);
  }

  for (const item of items) {
    if (item.isDM || !item.name) continue;
    const name = item.name;
    const first = name[0]?.toUpperCase() ?? '';
    const needsTwo = (firstLetterCount.get(first) ?? 0) > 1 && name.length > 1;
    const letters = needsTwo ? first + name[1].toUpperCase() : first;
    result.set(item.id, letters);
  }

  return result;
}

export function ChannelLetterIcon(props: { letters: string }) {
  return (
    <Avatar size="md" class="bg-ink-extra-muted/15 text-ink-muted">
      <Avatar.Fallback>{props.letters}</Avatar.Fallback>
    </Avatar>
  );
}

export function groupByChannel(
  notifications: UnifiedNotification[]
): Map<string, ChannelGroup> {
  const groups = new Map<string, ChannelGroup>();

  for (const notification of notifications) {
    if (!isChannelNotification(notification)) continue;

    const entityId = notification.entity_id;
    const info = getChannelInfo(notification);

    if (!groups.has(entityId)) {
      groups.set(entityId, {
        entityId,
        channelName: info.channelName,
        channelType: info.channelType,
        isDM: info.isDM,
        notifications: [],
        latestSenderId: null,
      });
    }

    const group = groups.get(entityId)!;
    group.notifications.push(notification);

    // Track latest sender for DMs
    if (info.isDM && notification.sender_id) {
      group.latestSenderId = notification.sender_id;
    }
  }

  return groups;
}

export function filterUnreadNotDone(notifications: UnifiedNotification[]) {
  return notifications.filter((n) => !n.viewed_at && !n.done);
}

/**
 * Orders unread channel groups without reshuffling on every notification:
 * newly-unread channels enter at the top (newest first), channels already in
 * the list keep their position, and channels with no unreads left drop out.
 */
export function createStableOrderedGroups(
  groupsMap: Accessor<Map<string, ChannelGroup>>
): Accessor<ChannelGroup[]> {
  const [orderedIds, setOrderedIds] = createSignal<string[]>([]);

  createEffect(
    on(groupsMap, (groups) => {
      const currentIds = new Set(groups.keys());
      const prev = orderedIds();
      const kept = prev.filter((id) => currentIds.has(id));
      const keptSet = new Set(kept);
      const added = [...currentIds].filter((id) => !keptSet.has(id));

      if (added.length === 0 && kept.length === prev.length) return;

      added.sort((a, b) => {
        const aTime = groups.get(a)?.notifications[0]?.created_at;
        const bTime = groups.get(b)?.notifications[0]?.created_at;
        return compareDateDesc(aTime, bTime);
      });

      setOrderedIds([...added, ...kept]);
    })
  );

  return createMemo(() => {
    const groups = groupsMap();
    return orderedIds()
      .map((id) => groups.get(id))
      .filter((g): g is ChannelGroup => g != null);
  });
}

function SlimChannelItem(props: {
  group: ChannelGroup;
  channelLetters?: string;
}) {
  const notificationSource = useGlobalNotificationSource();
  const senderName = useSenderName(props.group.latestSenderId);

  const displayName = () => {
    if (props.group.isDM) {
      return senderName() ?? 'Direct Message';
    }
    return props.group.channelName
      ? `#${props.group.channelName}`
      : 'Unknown Channel';
  };

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? false;

  const navigateToLatestNotification = (newSplit = false) => {
    const manager = globalSplitManager();
    if (!manager) return;
    openNotification(props.group.notifications[0], manager, newSplit);
  };

  return (
    <ContextMenu>
      <ContextMenu.Trigger class="w-full">
        <Tooltip label={displayName()} placement="right">
          <Button
            class="flex items-center justify-center size-8 cursor-default rounded-md text-ink-extra-muted not-disabled:hover:bg-ink/3"
            draggable={false}
            variant="ghost"
            size="sm"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              navigateToLatestNotification(e.shiftKey);
            }}
          >
            <div class="relative flex items-center justify-center shrink-0 size-5">
              <Show
                when={props.group.isDM && props.group.latestSenderId}
                fallback={
                  <ChannelLetterIcon letters={props.channelLetters ?? '?'} />
                }
              >
                <UserIcon
                  id={props.group.latestSenderId!}
                  size="md"
                  suppressClick
                  showTooltip={false}
                />
              </Show>
              <div class="absolute -top-0.5 -right-0.5 size-1.5 bg-accent rounded-full ring-surface ring-2" />
            </div>
          </Button>
        </Tooltip>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenuContent class="text-xs text-ink-muted">
          <MenuItem
            text="Open in new split"
            onClick={() => navigateToLatestNotification(true)}
            disabled={!canOpenInNewSplit()}
          />
          <MenuItem
            text="Open in current split"
            onClick={() => navigateToLatestNotification(false)}
          />
          <MenuItem
            text="Mark all as read"
            onClick={() =>
              void notificationSource.bulkMarkAsRead(props.group.notifications)
            }
          />
          <MenuItem
            text="Mark all as done"
            onClick={() =>
              void notificationSource.bulkMarkAsDone(props.group.notifications)
            }
          />
        </ContextMenuContent>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

/**
 * Slim-sidebar strip of unread channel avatars (up to 4, plus a "+N"
 * overflow). The expanded-sidebar channel list lives nested under the
 * Channels nav tab instead — see `SidebarChannelsList`.
 */
export const ChannelsUnreadWidget = () => {
  const notificationSource = useGlobalNotificationSource();

  const channelGroupsMap = createMemo(() =>
    groupByChannel(filterUnreadNotDone([...notificationSource.notifications()]))
  );

  const channelGroups = createStableOrderedGroups(channelGroupsMap);

  const channelLettersMap = createMemo(() =>
    computeChannelLetters(
      channelGroups().map((g) => ({
        id: g.entityId,
        name: g.channelName,
        isDM: g.isDM,
      }))
    )
  );

  const SLIM_MAX = 4;
  const slimVisible = () => channelGroups().slice(0, SLIM_MAX);
  const slimOverflow = () => Math.max(0, channelGroups().length - SLIM_MAX);

  return (
    <Show when={channelGroups().length > 0}>
      <section class="w-full p-2 flex flex-col items-center">
        <For each={slimVisible()}>
          {(group) => (
            <SlimChannelItem
              group={group}
              channelLetters={channelLettersMap().get(group.entityId)}
            />
          )}
        </For>
        <Show when={slimOverflow() > 0}>
          <span class="text-xxs text-ink-muted mt-1">+{slimOverflow()}</span>
        </Show>
      </section>
    </Show>
  );
};
