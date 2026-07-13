import { useMaybeSoupView } from '@app/features/next-soup/soup-view/soup-view-context';
import { navigateToChannelMessage } from '@block-channel/utils/link';
import { useGlobalBlockOrchestrator } from '@components/app/GlobalAppState';
import { SidePanel } from '@components/app/side-panel';
import { isMobile } from '@core/mobile/isMobile';
import {
  type ChannelEntity,
  EntityRowIcon,
  EntityRowTitle,
  formatRelativeTimestamp,
} from '@entity';
import ArrowClockwiseIcon from '@phosphor/arrow-clockwise.svg';
import ArrowUpRightIcon from '@phosphor/arrow-up-right.svg';
import { createAIProjection } from '@queries/ai/projection';
import { Button, cn } from '@ui';
import { type Accessor, createMemo, For, Match, Show, Switch } from 'solid-js';
import {
  buildChannelSummaryPrompt,
  CHANNEL_SUMMARY_MODEL,
  type ChannelSummary,
  channelSummaryProjectionId,
  channelSummarySchema,
  MAX_SUMMARY_CHANNELS,
} from './channel-summary';

/**
 * Per-channel AI activity summaries for the Channels view's right bar: one
 * side-panel bento per visible channel, each materialized by a per-channel
 * AI projection whose highlights deep-link into the channel's messages.
 *
 * Renders nothing itself — sections register with the surrounding
 * `SidePanel.Layout` (see the `channels` entry in the component registry).
 */
export function ChannelSummarySections() {
  const soupView = useMaybeSoupView();
  // The narrow-mode side panel is a full-screen overlay, which fights the
  // mobile list chrome — desktop/tablet only.
  if (!soupView || isMobile()) return null;

  // Top channels in the list's current order. Keyed by id (not row identity)
  // so soup refetches don't churn the sections; entity data is looked up
  // reactively per section below.
  const channelIds = createMemo(
    () => {
      const ids: string[] = [];
      for (const row of soupView.rows()) {
        if (row.getIsGrouped() || row.getIsLoadMore()) continue;
        const entity = row.original;
        if (entity.type !== 'channel' || ids.includes(entity.id)) continue;
        ids.push(entity.id);
        if (ids.length >= MAX_SUMMARY_CHANNELS) break;
      }
      return ids;
    },
    [],
    {
      equals: (prev, next) =>
        prev.length === next.length && prev.every((id, i) => id === next[i]),
    }
  );

  const channelById = (id: string): ChannelEntity | undefined => {
    for (const row of soupView.rows()) {
      const entity = row.original;
      if (entity.type === 'channel' && entity.id === id) return entity;
    }
    return undefined;
  };

  return (
    <For each={channelIds()}>
      {(channelId, index) => (
        <Show when={channelById(channelId)}>
          {(channel) => (
            <ChannelSummarySection channel={channel} order={index()} />
          )}
        </Show>
      )}
    </For>
  );
}

function ChannelSummarySection(props: {
  channel: Accessor<ChannelEntity>;
  order: number;
}) {
  return (
    <SidePanel.Section
      id={`channel-summary:${props.channel().id}`}
      title={
        <span class="inline-flex items-center gap-1.5 min-w-0">
          <span class="size-3.5 shrink-0">
            <EntityRowIcon entity={props.channel()} suppressClick />
          </span>
          <EntityRowTitle entity={props.channel()} />
        </span>
      }
      defaultOpen
      order={props.order}
    >
      <ChannelSummaryContent channel={props.channel()} />
    </SidePanel.Section>
  );
}

function ChannelSummaryContent(props: { channel: ChannelEntity }) {
  const orchestrator = useGlobalBlockOrchestrator();

  const projection = createAIProjection(() => ({
    id: channelSummaryProjectionId(props.channel.id),
    prompt: buildChannelSummaryPrompt({
      id: props.channel.id,
      name: props.channel.name,
    }),
    schema: channelSummarySchema,
    model: CHANNEL_SUMMARY_MODEL,
    refreshCadence: 'high',
    expiry: 'day',
  }));

  // Schema-less string results can't occur (a schema is set), but the hook's
  // result type includes them — narrow to the parsed object.
  const summary = (): ChannelSummary | undefined => {
    const data = projection.data();
    return data === undefined || typeof data === 'string' ? undefined : data;
  };

  const generatedAt = () => projection.query.data?.generated_at;

  return (
    <div class="flex flex-col gap-2 text-xs">
      <Switch>
        <Match when={summary()}>
          {(data) => (
            <>
              <p class="ph-no-capture text-ink-muted leading-5">
                {data().summary}
              </p>
              <Show when={data().highlights.length > 0}>
                <div class="flex flex-col">
                  <For each={data().highlights}>
                    {(highlight) => (
                      <button
                        type="button"
                        class="ph-no-capture group/highlight flex items-center gap-1.5 min-w-0 rounded-md px-1 py-1 text-left text-ink-muted hover:bg-hover hover:text-ink"
                        onClick={() =>
                          void navigateToChannelMessage(
                            orchestrator,
                            props.channel.id,
                            highlight.messageId
                          )
                        }
                      >
                        <ArrowUpRightIcon class="size-3 shrink-0 text-ink-extra-muted group-hover/highlight:text-ink-muted" />
                        <span class="truncate">{highlight.label}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
              <div class="flex items-center justify-between gap-2 text-ink-extra-muted">
                <span class="truncate">
                  <Show
                    when={!projection.isGenerating()}
                    fallback="Updating..."
                  >
                    <Show when={generatedAt()}>
                      {(ts) => `Updated ${formatRelativeTimestamp(ts())}`}
                    </Show>
                  </Show>
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  label="Refresh summary"
                  class="size-5 p-0.5 text-ink-extra-muted hover:text-ink-muted"
                  disabled={projection.isGenerating()}
                  onClick={() => void projection.refresh()}
                >
                  <ArrowClockwiseIcon
                    class={cn(
                      'size-3',
                      projection.isGenerating() && 'animate-spin'
                    )}
                  />
                </Button>
              </div>
            </>
          )}
        </Match>
        <Match when={projection.isGenerating()}>
          <div class="flex flex-col gap-2 py-1" aria-hidden="true">
            <div class="h-2 w-full animate-pulse rounded-full bg-edge-muted/50" />
            <div class="h-2 w-3/4 animate-pulse rounded-full bg-edge-muted/50" />
          </div>
        </Match>
        <Match when={projection.error()}>
          <div class="flex items-center justify-between gap-2">
            <span class="text-ink-muted">Summary unavailable</span>
            <button
              type="button"
              class="shrink-0 text-accent hover:text-accent/80"
              onClick={() => void projection.refresh()}
            >
              Try again
            </button>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
