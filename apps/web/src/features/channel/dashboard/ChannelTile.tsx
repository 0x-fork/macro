import { Channel as ChannelView } from '@channel/Channel/Channel';
import { useSenderName } from '@components/app/app-sidebar/utils';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { EntityIcon } from '@core/component/EntityIcon';
import { EntityPermissionsGate } from '@core/component/EntityPermissionsGate';
import { UserIcon } from '@core/component/UserIcon';
import { useChannel } from '@core/context/channels';
import { useUserId } from '@core/context/user';
import { markNotificationForEntityIdAsRead } from '@notifications';
import ArrowSquareOutIcon from '@phosphor/arrow-square-out.svg';
import ArrowsInSimpleIcon from '@phosphor/arrows-in-simple.svg';
import ArrowsOutSimpleIcon from '@phosphor/arrows-out-simple.svg';
import PushPinIcon from '@phosphor/push-pin.svg';
import PushPinSlashIcon from '@phosphor/push-pin-slash.svg';
import XIcon from '@phosphor/x.svg';
import { ChannelTypeEnum } from '@service-storage/client';
import { Button, cn, Tooltip } from '@ui';
import { Show } from 'solid-js';

export type ChannelTileProps = {
  channelId: string;
  unreadCount: number;
  isPinned: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onTogglePinned: () => void;
  onRemove: () => void;
  onOpenFull: () => void;
};

function TileIcon(props: { channelId: string }) {
  const channel = useChannel(props.channelId);
  const userId = useUserId();
  const dmRecipient = () => {
    if (channel()?.channel_type !== ChannelTypeEnum.DirectMessage)
      return undefined;
    return channel()?.participants.find((p) => p.user_id !== userId());
  };

  return (
    <Show
      when={dmRecipient()}
      fallback={
        <EntityIcon targetType="channel" size="xs" class="size-3.5 shrink-0" />
      }
    >
      {(recipient) => (
        <UserIcon
          id={recipient().user_id}
          size="sm"
          suppressClick
          showTooltip={false}
        />
      )}
    </Show>
  );
}

export function useChannelTileName(channelId: string) {
  const channel = useChannel(channelId);
  const userId = useUserId();
  const dmRecipientId = () => {
    if (channel()?.channel_type !== ChannelTypeEnum.DirectMessage)
      return undefined;
    return channel()?.participants.find((p) => p.user_id !== userId())?.user_id;
  };
  const recipientName = useSenderName(dmRecipientId());

  return () => {
    const current = channel();
    if (current?.channel_type === ChannelTypeEnum.DirectMessage) {
      return recipientName() ?? 'Direct message';
    }
    return current?.name?.trim() || 'New Channel';
  };
}

/**
 * One dashboard cell: a slim header (channel identity, unread badge, tile
 * actions) over a fully live channel view — message list plus composer — so
 * every visible channel can be read and replied to in place.
 */
export function ChannelTile(props: ChannelTileProps) {
  const notificationSource = useGlobalNotificationSource();
  const channelName = useChannelTileName(props.channelId);

  // Interacting with a tile counts as reading it: clear its unread
  // notifications so the badge reflects what the user has actually seen.
  const markRead = () => {
    if (props.unreadCount === 0) return;
    void markNotificationForEntityIdAsRead(notificationSource, props.channelId);
  };

  return (
    <section
      class={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-surface ring-1',
        props.unreadCount > 0 ? 'ring-accent' : 'ring-edge',
        props.isExpanded && 'absolute inset-2 z-20 shadow-menu'
      )}
      onFocusIn={markRead}
      data-channel-tile={props.channelId}
    >
      <header
        class="flex h-9 shrink-0 items-center gap-1.5 border-b border-edge-muted px-2"
        onDblClick={props.onToggleExpanded}
      >
        <TileIcon channelId={props.channelId} />
        <span class="ph-no-capture min-w-0 truncate text-sm font-medium text-ink">
          {channelName()}
        </span>
        <Show when={props.unreadCount > 0}>
          <span class="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-accent px-1.5 text-xs font-medium text-surface">
            {props.unreadCount}
          </span>
        </Show>
        <div class="flex-1" />
        <div class="flex shrink-0 items-center gap-0.5 text-ink-muted">
          <Tooltip label={props.isPinned ? 'Unpin' : 'Pin to dashboard'}>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={props.onTogglePinned}
              aria-label={props.isPinned ? 'Unpin' : 'Pin to dashboard'}
            >
              <Show
                when={props.isPinned}
                fallback={<PushPinIcon class="size-3.5" />}
              >
                <PushPinSlashIcon class="size-3.5" />
              </Show>
            </Button>
          </Tooltip>
          <Tooltip label="Open full channel">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={props.onOpenFull}
              aria-label="Open full channel"
            >
              <ArrowSquareOutIcon class="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip label={props.isExpanded ? 'Back to grid' : 'Expand'}>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={props.onToggleExpanded}
              aria-label={props.isExpanded ? 'Back to grid' : 'Expand'}
            >
              <Show
                when={props.isExpanded}
                fallback={<ArrowsOutSimpleIcon class="size-3.5" />}
              >
                <ArrowsInSimpleIcon class="size-3.5" />
              </Show>
            </Button>
          </Tooltip>
          <Tooltip label="Remove from dashboard">
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={props.onRemove}
              aria-label="Remove from dashboard"
            >
              <XIcon class="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </header>
      <div class="min-h-0 flex-1 px-2">
        <EntityPermissionsGate entityType="channel" entityId={props.channelId}>
          <ChannelView channelId={props.channelId} autofocus={false} />
        </EntityPermissionsGate>
      </div>
    </section>
  );
}
