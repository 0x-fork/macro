import { runCreateAction } from '@app/features/command/Launcher';
import { getViewPreset } from '@app/features/next-soup/sidebar/soup-filter-presets';
import { SoupView } from '@app/features/next-soup/soup-view/soup-view';
import { WIDE_SPLIT_PANEL_BREAKPOINT } from '@app/features/next-soup/soup-view/use-preview-pane-visibility';
import { usePreference } from '@app/preferences/use-preference';
import { globalSplitManager } from '@app/signal/splitLayout';
import { Channel } from '@channel/Channel/Channel';
import { HeaderIsland } from '@components/app/split-layout/components/HeaderIsland';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { EntityIcon } from '@core/component/EntityIcon';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { UserIcon } from '@core/component/UserIcon';
import { useChannelsContext } from '@core/context/channels';
import { useUserId } from '@core/context/user';
import { isMobile } from '@core/mobile/isMobile';
import { tryMacroId, useDisplayNameParts } from '@core/user';
import ArrowSquareOutIcon from '@phosphor/arrow-square-out.svg';
import GridFourIcon from '@phosphor/grid-four.svg';
import ListBulletsIcon from '@phosphor/list-bullets.svg';
import PlusCircleIcon from '@phosphor/plus-circle.svg';
import UsersIcon from '@phosphor/users.svg';
import type { ApiChannelWithLatest } from '@service-storage/channel-list-types';
import { ChannelTypeEnum } from '@service-storage/client';
import { Key } from '@solid-primitives/keyed';
import { Button, cn, EmptyStatePanel, Tooltip } from '@ui';
import {
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';

type ChannelsViewMode = 'gallery' | 'list';

/**
 * The Channels tab. On wide splits it defaults to the gallery: every channel
 * rendered as a large, fully interactive card (message list + input) in a
 * two-wide grid, so you can read and reply without opening each channel.
 * Narrow splits and mobile fall back to the classic list view, and a header
 * toggle lets you switch between the two on wide splits.
 */
export function ChannelsTabView() {
  const panel = useSplitPanelOrThrow();
  const [viewMode, setViewMode] = usePreference<ChannelsViewMode>(
    'macro:pref:channels:view-mode',
    { default: 'gallery' }
  );

  // The panel size is null until the first measure; assume wide so the
  // default gallery doesn't flash the list view on desktop first paint.
  const isWideSplit = () =>
    (panel.panelSize.width ?? Number.POSITIVE_INFINITY) >
    WIDE_SPLIT_PANEL_BREAKPOINT;

  const galleryActive = () =>
    !isMobile() && isWideSplit() && viewMode() === 'gallery';

  const soupPreset = getViewPreset('channels');

  return (
    <>
      <Show when={!isMobile() && isWideSplit()}>
        <SplitHeaderRight>
          <Tooltip
            label={
              viewMode() === 'gallery'
                ? 'Switch to list view'
                : 'Switch to gallery view'
            }
          >
            <Button
              variant="base"
              class="p-1 size-7 rounded-lg bg-surface"
              depth={2}
              label={
                viewMode() === 'gallery'
                  ? 'Switch to list view'
                  : 'Switch to gallery view'
              }
              onClick={() =>
                setViewMode(viewMode() === 'gallery' ? 'list' : 'gallery')
              }
            >
              <Show
                when={viewMode() === 'gallery'}
                fallback={<GridFourIcon class="size-4" />}
              >
                <ListBulletsIcon class="size-4" />
              </Show>
            </Button>
          </Tooltip>
        </SplitHeaderRight>
      </Show>
      <Show
        when={galleryActive()}
        fallback={
          <SoupView
            viewName="Channels"
            initialFilters={soupPreset?.filters}
            initialClientFilters={soupPreset?.clientFilters}
            initialGroupBy={soupPreset?.groupBy}
          />
        }
      >
        <ChannelsGallery />
      </Show>
    </>
  );
}

/** Most-recent-activity timestamp for initial gallery ordering. */
const channelRecency = (channel: ApiChannelWithLatest): number => {
  const latest = channel.latest_message?.created_at ?? channel.updated_at;
  const time = new Date(latest).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const byRecencyDesc = (a: ApiChannelWithLatest, b: ApiChannelWithLatest) =>
  channelRecency(b) - channelRecency(a);

function ChannelsGallery() {
  const { channels, isLoading } = useChannelsContext();

  // Order by recency once, then keep it stable while the gallery is mounted:
  // live re-sorting would shuffle cards (and yank focus mid-reply) every time
  // any channel receives a message. Deleted channels drop out; channels that
  // appear later are appended.
  const orderedChannels = createMemo<ApiChannelWithLatest[]>((prev = []) => {
    const byId = new Map(channels().map((channel) => [channel.id, channel]));
    const kept = prev
      .filter((channel) => byId.has(channel.id))
      .map((channel) => byId.get(channel.id)!);
    const keptIds = new Set(kept.map((channel) => channel.id));
    const added = channels()
      .filter((channel) => !keptIds.has(channel.id))
      .sort(byRecencyDesc);
    return [...kept, ...added];
  });

  const createChannel = () =>
    runCreateAction('channel', { source: 'channels_gallery' });

  return (
    <>
      <SplitHeaderLeft>
        <HeaderIsland class="shrink">
          <div class="flex h-full items-center gap-2">
            <span class="text-sm font-semibold">Channels</span>
            <Show when={orderedChannels().length > 0}>
              <span class="text-xs tabular-nums text-ink-extra-muted">
                {orderedChannels().length}
              </span>
            </Show>
          </div>
        </HeaderIsland>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <Button
          variant="base"
          class="h-7 gap-1.5 rounded-lg bg-surface px-2 text-[13px]"
          depth={2}
          label="New channel"
          onClick={createChannel}
        >
          <PlusCircleIcon class="size-4" />
          Channel
        </Button>
      </SplitHeaderRight>
      <Show when={!isLoading()} fallback={<LoadingBlock />}>
        <Show
          when={orderedChannels().length > 0}
          fallback={
            <EmptyStatePanel
              centered
              title="No channels yet"
              description="Create a channel to start a conversation with your team."
              primaryAction={{ label: 'New channel', onClick: createChannel }}
            />
          }
        >
          <div class="size-full min-h-0 overflow-y-auto">
            <div class="grid grid-cols-2 gap-3 p-3">
              <Key each={orderedChannels()} by={(channel) => channel.id}>
                {(channel) => <ChannelGalleryCard channel={channel()} />}
              </Key>
            </div>
          </div>
        </Show>
      </Show>
    </>
  );
}

/**
 * How far outside the viewport a card starts mounting its live channel.
 * Mounting is deferred so a long channel list doesn't fire dozens of message
 * queries (and mark every channel viewed) on open.
 */
const CARD_MOUNT_ROOT_MARGIN = '320px';

/** Display name for a DM peer, falling back to their email handle. */
function DmPeerName(props: { userId: string }) {
  const nameParts = useDisplayNameParts(tryMacroId(props.userId));
  const name = () => {
    const fullName = nameParts.fullName();
    if (fullName) return fullName;
    if (props.userId.startsWith('macro|')) {
      return props.userId.slice('macro|'.length).split('@')[0];
    }
    return 'Direct message';
  };
  return <>{name()}</>;
}

function ChannelCardPlaceholder() {
  return (
    <div class="flex flex-1 min-h-0 flex-col justify-end gap-3 p-4">
      <div class="h-3 w-2/5 animate-pulse rounded bg-ink/6" />
      <div class="h-3 w-4/5 animate-pulse rounded bg-ink/6" />
      <div class="h-3 w-3/5 animate-pulse rounded bg-ink/6" />
      <div class="mt-2 h-9 w-full animate-pulse rounded-lg bg-ink/6" />
    </div>
  );
}

function ChannelGalleryCard(props: { channel: ApiChannelWithLatest }) {
  const userId = useUserId();
  const { activityByChannelId } = useChannelsContext();
  const [shouldMountChannel, setShouldMountChannel] = createSignal(false);
  let cardEl: HTMLDivElement | undefined;

  onMount(() => {
    const el = cardEl;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setShouldMountChannel(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldMountChannel(true);
          observer.disconnect();
        }
      },
      { rootMargin: CARD_MOUNT_ROOT_MARGIN }
    );
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  });

  const isDm = () =>
    props.channel.channel_type === ChannelTypeEnum.DirectMessage;

  const dmPeerId = () =>
    isDm()
      ? props.channel.participants.find((p) => p.user_id !== userId())?.user_id
      : undefined;

  // Unseen activity from someone else. Once the card's channel mounts it
  // marks itself viewed (you are looking at the messages), which clears this
  // — so in practice the dot mostly flags cards still below the fold.
  const isUnread = () => {
    const latest = props.channel.latest_message;
    if (!latest || latest.sender_id === userId()) return false;
    const viewedAt =
      activityByChannelId()[props.channel.id]?.viewed_at ??
      props.channel.viewed_at;
    if (!viewedAt) return true;
    return new Date(latest.created_at).getTime() > new Date(viewedAt).getTime();
  };

  const openChannel = (event?: MouseEvent) => {
    globalSplitManager()?.openWithSplit(
      { type: 'channel', id: props.channel.id },
      {
        activate: true,
        referredFrom: 'channels',
        preferNewSplit: event?.shiftKey,
        reopen: 'latest',
      }
    );
  };

  return (
    <div
      ref={cardEl}
      class="flex h-[560px] max-h-[75vh] min-h-80 flex-col overflow-hidden rounded-xl border border-edge-muted bg-surface"
      data-channel-gallery-card={props.channel.id}
    >
      <button
        type="button"
        class={cn(
          'group/card-header flex h-10 w-full shrink-0 cursor-default items-center gap-2 border-b border-edge-muted px-3 text-left',
          'hover:bg-ink/3'
        )}
        onClick={(event) => openChannel(event)}
      >
        <Show
          when={dmPeerId()}
          fallback={
            <EntityIcon
              targetType="channel"
              size="xs"
              class="size-4 shrink-0"
            />
          }
        >
          {(peerId) => (
            <UserIcon
              id={peerId()}
              size="sm"
              suppressClick
              showTooltip={false}
              class="size-4 shrink-0"
            />
          )}
        </Show>
        <span class="ph-no-capture min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          <Show
            when={dmPeerId()}
            fallback={props.channel.name?.trim() || 'New Channel'}
          >
            {(peerId) => <DmPeerName userId={peerId()} />}
          </Show>
        </span>
        <Show when={isUnread()}>
          <span class="size-2 shrink-0 rounded-full bg-accent" />
        </Show>
        <Show when={!isDm()}>
          <span class="flex shrink-0 items-center gap-1 text-xs tabular-nums text-ink-extra-muted">
            <UsersIcon class="size-3.5" />
            {props.channel.participants.length}
          </span>
        </Show>
        <ArrowSquareOutIcon class="size-3.5 shrink-0 text-ink-extra-muted opacity-0 transition-opacity group-hover/card-header:opacity-100" />
      </button>
      <div class="flex min-h-0 flex-1 flex-col px-2">
        <Show when={shouldMountChannel()} fallback={<ChannelCardPlaceholder />}>
          <Suspense fallback={<ChannelCardPlaceholder />}>
            <Channel channelId={props.channel.id} autofocus={false} />
          </Suspense>
        </Show>
      </div>
    </div>
  );
}
