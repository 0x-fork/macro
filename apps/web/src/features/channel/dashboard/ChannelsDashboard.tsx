import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { LoadingBlock } from '@core/component/LoadingBlock';
import ListIcon from '@phosphor/list.svg';
import PlusIcon from '@phosphor/plus.svg';
import { Button, EmptyStatePanel, Tooltip } from '@ui';
import { createMemo, createSignal, For, Show } from 'solid-js';
import { AddChannelCombobox } from './AddChannelCombobox';
import { ChannelTile, useChannelTileName } from './ChannelTile';
import { createChannelsDashboard } from './use-dashboard-channels';

const UNREAD_ELSEWHERE_CHIP_LIMIT = 8;

function UnreadElsewhereChip(props: {
  channelId: string;
  count: number;
  onOpen: () => void;
}) {
  const name = useChannelTileName(props.channelId);
  return (
    <button
      type="button"
      class="flex h-6 shrink-0 items-center gap-1.5 rounded-md bg-ink/[0.055] px-2 text-xs text-ink hover:bg-hover"
      onClick={props.onOpen}
    >
      <span class="ph-no-capture max-w-40 truncate">{name()}</span>
      <span class="flex h-4 min-w-4 items-center justify-center rounded bg-accent px-1 text-xxs font-medium text-surface">
        {props.count}
      </span>
      <PlusIcon class="size-3 text-ink-muted" />
    </button>
  );
}

/**
 * The channels tab as a live dashboard: a grid of channels you can read and
 * reply to side by side, unread-first, with per-tile expand ("fullscreen"
 * within the tab) and escape hatches to the full channel block and the
 * classic list view.
 */
export function ChannelsDashboard() {
  const dashboard = createChannelsDashboard();
  const splitPanel = useSplitPanelOrThrow();
  const [expandedId, setExpandedId] = createSignal<string | null>(null);

  const openFullChannel = (channelId: string) => {
    splitPanel.handle.replace({ next: { type: 'channel', id: channelId } });
  };

  const openChannelsList = () => {
    splitPanel.handle.replace({
      next: { type: 'component', id: 'channels-list' },
    });
  };

  const openNewChannelCompose = () => {
    splitPanel.handle.replace({
      next: { type: 'component', id: 'channel-compose' },
    });
  };

  const removeChannel = (channelId: string) => {
    if (expandedId() === channelId) setExpandedId(null);
    dashboard.removeChannel(channelId);
  };

  const unreadChips = createMemo(() =>
    dashboard.unreadElsewhere().slice(0, UNREAD_ELSEWHERE_CHIP_LIMIT)
  );

  return (
    <div class="flex h-full min-h-0 flex-col">
      <SplitHeaderLeft>
        <div class="flex h-full shrink-0 items-center">
          <span class="text-sm font-semibold">Channels</span>
        </div>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <div class="flex h-full items-center gap-1.5">
          <AddChannelCombobox
            channels={dashboard.channels()}
            excludeIds={dashboard.displayedIds()}
            unreadCounts={dashboard.unreadCounts()}
            onAdd={dashboard.addChannel}
          />
          <Tooltip label="All channels">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={openChannelsList}
              aria-label="All channels"
            >
              <ListIcon class="size-4" />
            </Button>
          </Tooltip>
        </div>
      </SplitHeaderRight>

      {/* Unread channels without a tile — one click promotes them into view. */}
      <Show when={unreadChips().length > 0}>
        <div class="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 py-1.5">
          <span class="shrink-0 text-xs text-ink-muted">Also unread</span>
          <For each={unreadChips()}>
            {(entry) => (
              <UnreadElsewhereChip
                channelId={entry.channel.id}
                count={entry.count}
                onOpen={() => dashboard.addChannel(entry.channel.id)}
              />
            )}
          </For>
        </div>
      </Show>

      <Show
        when={dashboard.displayedIds().length > 0}
        fallback={
          <Show when={!dashboard.isLoading()} fallback={<LoadingBlock />}>
            <Show
              when={dashboard.channels().length > 0}
              fallback={
                <EmptyStatePanel
                  centered
                  title="No channels yet"
                  description="Create a channel to start the conversation."
                  primaryAction={{
                    label: 'New channel',
                    onClick: openNewChannelCompose,
                  }}
                />
              }
            >
              <EmptyStatePanel
                centered
                title="Nothing on the dashboard"
                description="Use “Add channel” above to bring channels onto the dashboard."
              />
            </Show>
          </Show>
        }
      >
        <div class="relative min-h-0 flex-1">
          <div class="h-full overflow-y-auto p-2 pt-0.5">
            <div
              class="grid min-h-full gap-2"
              style={{
                'grid-template-columns':
                  'repeat(auto-fit, minmax(min(26rem, 100%), 1fr))',
                'grid-auto-rows': 'minmax(22rem, 1fr)',
              }}
            >
              <For each={dashboard.displayedIds()}>
                {(channelId) => (
                  <ChannelTile
                    channelId={channelId}
                    unreadCount={dashboard.unreadCounts().get(channelId) ?? 0}
                    isPinned={dashboard.isPinned(channelId)}
                    isExpanded={expandedId() === channelId}
                    onToggleExpanded={() =>
                      setExpandedId((prev) =>
                        prev === channelId ? null : channelId
                      )
                    }
                    onTogglePinned={() => dashboard.togglePinned(channelId)}
                    onRemove={() => removeChannel(channelId)}
                    onOpenFull={() => openFullChannel(channelId)}
                  />
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
