import {
  type ChannelGroup,
  ChannelLetterIcon,
  computeChannelLetters,
  createStableOrderedGroups,
  filterUnreadNotDone,
  groupByChannel,
} from '@app/component/app-sidebar/channels-unread-widget';
import { useSenderName } from '@app/component/app-sidebar/utils';
import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { UserIcon } from '@core/component/UserIcon';
import { useUserId } from '@core/context/user';
import { ContextMenu } from '@kobalte/core/context-menu';
import { openNotification } from '@notifications';
import { useListChannelsQuery } from '@queries/channel/channels';
import type { ApiChannelWithLatest } from '@service-storage/channel-list-types';
import { makePersisted } from '@solid-primitives/storage';
import { Button, cn } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';

/** How many channels the "all" (recent) mode shows. */
const RECENT_CHANNELS_MAX = 20;

/**
 * Whether the nested channel list under the Channels nav tab is open. A plain
 * user toggle (chevron / clicking the active Channels tab), persisted across
 * reloads — never collapsed by navigation. Default open, since unread-only
 * mode matches the always-visible widget this list replaces.
 */
export const [channelsListExpanded, setChannelsListExpanded] = makePersisted(
  createSignal(true),
  { name: 'sidebar-channels-expanded' }
);

/**
 * Unread-only (default) vs the 20 most recent channels — flipped by the
 * toggle switch on the Channels row, persisted across reloads.
 */
export const [channelsUnreadOnly, setChannelsUnreadOnly] = makePersisted(
  createSignal(true),
  { name: 'sidebar-channels-unread-only' }
);

type ChannelItem = {
  id: string;
  name: string | null;
  isDM: boolean;
  dmUserId: string | null;
  unreadCount: number;
  /** Unread notification group, when the channel has unreads. */
  group: ChannelGroup | undefined;
};

function channelRecency(channel: ApiChannelWithLatest): number {
  return Math.max(
    Date.parse(channel.updated_at) || 0,
    Date.parse(channel.interacted_at ?? '') || 0,
    Date.parse(channel.viewed_at ?? '') || 0
  );
}

function SidebarChannelRow(props: {
  item: ChannelItem;
  letters: string | undefined;
  visible: boolean;
  index: number;
}) {
  const notificationSource = useGlobalNotificationSource();
  const senderName = useSenderName(props.item.dmUserId);

  const displayName = () => {
    if (props.item.isDM) return senderName() ?? 'Direct Message';
    return props.item.name ? `#${props.item.name}` : 'Unknown Channel';
  };

  const unread = () => props.item.unreadCount > 0;

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? false;

  // Unread channels open at their latest notification's message; read ones
  // just open (or re-activate) the channel block.
  const open = (newSplit: boolean) => {
    const manager = globalSplitManager();
    if (!manager) return;
    const latest = props.item.group?.notifications[0];
    if (latest) {
      openNotification(latest, manager, newSplit);
      return;
    }
    const existing = manager.getSplitByContent('channel', props.item.id);
    if (existing && !newSplit) {
      existing.activate();
      return;
    }
    manager.openWithSplit(
      { type: 'channel', id: props.item.id },
      { activate: true, referredFrom: 'sidebar', preferNewSplit: newSplit }
    );
  };

  return (
    <li
      class={cn(
        'flex items-center justify-center first:mt-1 transition-[opacity,transform] duration-200 ease-out',
        props.visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      )}
      style={{
        'transition-delay': props.visible ? `${props.index * 20}ms` : '0ms',
      }}
    >
      <ContextMenu>
        <ContextMenu.Trigger class="w-full">
          <Button
            draggable={false}
            variant="ghost"
            disabled={!props.visible}
            data-sidebar-channel={props.item.id}
            class="flex items-center justify-start text-sm gap-2 cursor-default w-full h-8 rounded-md py-1 pl-6 text-ink-extra-muted not-disabled:hover:bg-ink/3"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              open(e.shiftKey);
            }}
          >
            <div class="relative flex items-center justify-center shrink-0 size-5">
              <Show
                when={props.item.isDM && props.item.dmUserId}
                fallback={<ChannelLetterIcon letters={props.letters ?? '?'} />}
              >
                <UserIcon
                  id={props.item.dmUserId!}
                  size="md"
                  suppressClick
                  showTooltip={false}
                />
              </Show>
            </div>

            <span class={cn('truncate', unread() && 'font-medium text-ink')}>
              {displayName()}
            </span>

            {/* Unread-only mode shows counts (every row is unread); recent
                mode marks unread rows with a dot, per Google Chat. */}
            <Show when={unread()}>
              <Show
                when={channelsUnreadOnly()}
                fallback={
                  <span class="shrink-0 size-1.5 bg-accent rounded-full ml-auto mr-1.5" />
                }
              >
                <span class="shrink-0 min-w-5 h-5 px-1.5 flex items-center justify-center text-xs font-medium bg-ink/6 text-ink-muted rounded-md ml-auto">
                  {props.item.unreadCount}
                </span>
              </Show>
            </Show>
          </Button>
        </ContextMenu.Trigger>

        <ContextMenu.Portal>
          <ContextMenuContent class="text-xs text-ink-muted">
            <MenuItem
              text="Open in new split"
              onClick={() => open(true)}
              disabled={!canOpenInNewSplit()}
            />
            <MenuItem
              text="Open in current split"
              onClick={() => open(false)}
            />
            <Show when={props.item.group}>
              {(group) => (
                <>
                  <MenuItem
                    text="Mark all as read"
                    onClick={() =>
                      void notificationSource.bulkMarkAsRead(
                        group().notifications
                      )
                    }
                  />
                  <MenuItem
                    text="Mark all as done"
                    onClick={() =>
                      void notificationSource.bulkMarkAsDone(
                        group().notifications
                      )
                    }
                  />
                </>
              )}
            </Show>
          </ContextMenuContent>
        </ContextMenu.Portal>
      </ContextMenu>
    </li>
  );
}

/**
 * The channel list nested under the Channels nav tab (expanded sidebar only).
 * Unread-only mode mirrors the old unread widget: one row per channel with
 * unread notifications, count pills, stable ordering. "All" mode shows the
 * 20 most recently active channels with unread rows bolded and dotted.
 * Empty unread mode renders nothing — the toggle on the Channels row remains
 * the way back to "all".
 */
export function SidebarChannelsList() {
  const notificationSource = useGlobalNotificationSource();
  const channelsQuery = useListChannelsQuery();
  const userId = useUserId();

  const groupsMap = createMemo(() =>
    groupByChannel(filterUnreadNotDone([...notificationSource.notifications()]))
  );

  const orderedGroups = createStableOrderedGroups(groupsMap);

  const unreadItems = (): ChannelItem[] =>
    orderedGroups().map((group) => ({
      id: group.entityId,
      name: group.channelName,
      isDM: group.isDM,
      dmUserId: group.latestSenderId,
      unreadCount: group.notifications.length,
      group,
    }));

  const recentItems = (): ChannelItem[] => {
    const groups = groupsMap();
    const me = userId();
    return [...(channelsQuery.data ?? [])]
      .sort((a, b) => channelRecency(b) - channelRecency(a))
      .slice(0, RECENT_CHANNELS_MAX)
      .map((channel) => {
        const group = groups.get(channel.id);
        const isDM = channel.channel_type === 'direct_message';
        const dmUserId = isDM
          ? (channel.participants.find((p) => p.user_id !== me)?.user_id ??
            group?.latestSenderId ??
            null)
          : null;
        return {
          id: channel.id,
          name: channel.name ?? null,
          isDM,
          dmUserId,
          unreadCount: group?.notifications.length ?? 0,
          group,
        };
      });
  };

  const items = createMemo(() =>
    channelsUnreadOnly() ? unreadItems() : recentItems()
  );

  const lettersMap = createMemo(() =>
    computeChannelLetters(
      items().map((i) => ({ id: i.id, name: i.name, isDM: i.isDM }))
    )
  );

  return (
    <Show when={items().length > 0}>
      <div
        class="grid w-full transition-[grid-template-rows] duration-200 ease-out"
        style={{ 'grid-template-rows': channelsListExpanded() ? '1fr' : '0fr' }}
      >
        <div class="min-h-0 overflow-hidden">
          <ul class="flex flex-col gap-0.5 max-h-80 overflow-y-auto">
            <For each={items()}>
              {(item, index) => (
                <SidebarChannelRow
                  item={item}
                  letters={lettersMap().get(item.id)}
                  visible={channelsListExpanded()}
                  index={index()}
                />
              )}
            </For>
          </ul>
        </div>
      </div>
    </Show>
  );
}
