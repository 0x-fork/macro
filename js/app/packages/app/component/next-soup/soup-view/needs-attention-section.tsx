import { openChatWithMessageAndAttachments } from '@app/component/ChatWithAgentButton';
import type { SoupEntity } from '@app/component/next-soup/create-soup-state';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { globalSplitManager } from '@app/signal/splitLayout';
import type { Attachment } from '@core/component/AI/types';
import ArrowClockwiseIcon from '@phosphor/arrow-clockwise.svg';
import CaretDownIcon from '@phosphor/caret-down.svg';
import SparkleIcon from '@phosphor/sparkle.svg';
import {
  type AttentionItem,
  createNeedsAttentionProjection,
  type NeedsAttentionVariant,
} from '@queries/ai/needs-attention';
import { EntityType } from '@service-cognition/generated/schemas/entityType';
import { Button, cn } from '@ui';
import { createMemo, createSignal, For, Match, Show, Switch } from 'solid-js';

const COLLAPSED_COUNT = 3;

type NeedsAttentionSectionProps = {
  /** Which triage projection to show; undefined renders nothing (and keeps
   * both projections disabled). */
  variant: () => NeedsAttentionVariant | undefined;
  /** Entities currently loaded in the list, used to resolve triaged ids to
   * real rows (for names and opening). */
  entities: () => SoupEntity[];
};

/** Attachment entity types the chat composer accepts, used to attach the
 * triaged item when handing its suggested action to the agent. */
const ATTACHABLE_TYPES = new Set<string>(Object.values(EntityType));

function toAttachment(item: AttentionItem): Attachment | undefined {
  const entityType =
    item.entity_type === 'email' ? 'email_thread' : item.entity_type;
  if (!ATTACHABLE_TYPES.has(entityType)) return undefined;
  return {
    entity_id: item.entity_id,
    entity_type: entityType as Attachment['entity_type'],
  };
}

function buildActionPrompt(
  variant: NeedsAttentionVariant,
  item: AttentionItem
): string {
  if (variant === 'email') {
    return [
      'Draft a reply to this email thread.',
      `Why it matters: ${item.reason}`,
      `Goal: ${item.suggested_action}`,
      "If a reply isn't the right move, do the most helpful thing instead and explain why.",
    ].join('\n');
  }
  return [
    `Help me handle this now: ${item.title}.`,
    `Why it needs attention: ${item.reason}`,
    `Suggested next step: ${item.suggested_action}`,
    'If you can complete the step yourself (draft the reply or message, summarize, prepare the change), do it and show me the result.',
  ].join('\n');
}

/** Fallback split content for items whose entity is not in the loaded list. */
function fallbackSplitContent(item: AttentionItem) {
  switch (item.entity_type) {
    case 'email':
    case 'email_thread':
      return { type: 'email', id: item.entity_id } as const;
    case 'channel':
      return { type: 'channel', id: item.entity_id } as const;
    case 'chat':
      return { type: 'chat', id: item.entity_id } as const;
    case 'project':
      return { type: 'project', id: item.entity_id } as const;
    default:
      return undefined;
  }
}

function SkeletonRow() {
  return (
    <div class="flex items-center gap-3 border-edge-muted border-t px-3 py-2.5">
      <div class="skeleton-shimmer size-4 shrink-0 rounded-full bg-edge-muted/50" />
      <div class="min-w-0 flex-1 space-y-1.5">
        <div class="skeleton-shimmer h-3 w-1/3 rounded-full bg-edge-muted/50" />
        <div class="skeleton-shimmer h-2.5 w-2/3 rounded-full bg-edge-muted/50" />
      </div>
      <div class="skeleton-shimmer h-5 w-24 shrink-0 rounded-full bg-edge-muted/50" />
    </div>
  );
}

/**
 * AI-triage banner rendered above the inbox/email list: the 5-10 items that
 * most need the user's attention, each with a reason and a suggested next
 * step. Backed by the `needs-attention` AI projections (cached server-side,
 * refreshed in the background, pushed over the connection gateway).
 *
 * Shows three items by default and expands to the full set. Rows open the
 * underlying entity; the action pill hands the suggested step to a fresh AI
 * chat with the item attached (e.g. drafting the reply). The section is not a
 * soup row, so j/k list navigation is unaffected.
 */
export function NeedsAttentionSection(props: NeedsAttentionSectionProps) {
  const panel = useSplitPanelOrThrow();

  // Both variants are instantiated with reactive `enabled` gates so only the
  // active view's projection ever fires.
  const inbox = createNeedsAttentionProjection(
    'inbox',
    () => props.variant() === 'inbox'
  );
  const email = createNeedsAttentionProjection(
    'email',
    () => props.variant() === 'email'
  );
  const active = () => {
    const variant = props.variant();
    if (variant === 'inbox') return inbox;
    if (variant === 'email') return email;
    return undefined;
  };

  const [expanded, setExpanded] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal(false);
  const [refreshing, setRefreshing] = createSignal(false);

  const items = () => active()?.items() ?? [];
  const visibleItems = () =>
    expanded() ? items() : items().slice(0, COLLAPSED_COUNT);
  const hiddenCount = () => Math.max(0, items().length - COLLAPSED_COUNT);
  const showSkeleton = () =>
    (active()?.isGenerating() ?? false) && !active()?.hasResult();
  const isRefreshing = () =>
    refreshing() ||
    ((active()?.isGenerating() ?? false) && active()?.hasResult());

  const entityById = createMemo(() => {
    const map = new Map<string, SoupEntity>();
    for (const entity of props.entities()) {
      if (!map.has(entity.id)) map.set(entity.id, entity);
    }
    return map;
  });
  const resolve = (item: AttentionItem) => entityById().get(item.entity_id);

  const openItem = async (item: AttentionItem) => {
    const entity = resolve(item);
    if (entity) {
      await openEntityInSplitFromUnifiedList(entity, {
        splitHandle: panel.handle,
        referredFrom: props.variant() === 'email' ? 'mail' : 'inbox',
      });
      return;
    }
    const content = fallbackSplitContent(item);
    if (!content) {
      console.warn('needs-attention: cannot open item', item);
      return;
    }
    globalSplitManager()?.openWithSplit(content, {
      activate: true,
      handle: panel.handle,
    });
  };

  const runAction = async (item: AttentionItem) => {
    const variant = props.variant();
    if (!variant) return;
    const attachment = toAttachment(item);
    await openChatWithMessageAndAttachments(
      buildActionPrompt(variant, item),
      attachment ? [attachment] : []
    );
  };

  const refresh = async () => {
    const projection = active();
    if (!projection || refreshing()) return;
    setRefreshing(true);
    try {
      await projection.refresh();
    } catch (error) {
      console.error('needs-attention refresh failed', error);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Show when={props.variant() && active()}>
      <section class="mx-2 mt-2 mb-1 overflow-hidden rounded-lg border border-edge-muted bg-surface">
        <div class="flex h-9 items-center gap-2 px-3">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => setCollapsed((prev) => !prev)}
          >
            <SparkleIcon class="size-3.5 shrink-0 text-accent" />
            <span class="truncate font-medium text-sm">
              Needs your attention
            </span>
            <Show when={!showSkeleton() && items().length > 0}>
              <span class="rounded-full bg-hover px-1.5 text-ink-muted text-xs tabular-nums">
                {items().length}
              </span>
            </Show>
            <CaretDownIcon
              class={cn(
                'size-3 shrink-0 text-ink-extra-muted transition-transform duration-200',
                collapsed() && '-rotate-90'
              )}
            />
          </button>
          <Button
            variant="base"
            size="sm"
            tooltip="Regenerate"
            disabled={isRefreshing() || showSkeleton()}
            onClick={() => void refresh()}
          >
            <ArrowClockwiseIcon
              class={cn('size-3.5', isRefreshing() && 'animate-spin')}
            />
          </Button>
        </div>

        <Show when={!collapsed()}>
          <Switch>
            <Match when={showSkeleton()}>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </Match>

            <Match when={active()?.error() && items().length === 0}>
              <div class="flex items-center gap-2 border-edge-muted border-t px-3 py-2.5 text-ink-muted text-sm">
                <span class="min-w-0 flex-1 truncate">
                  Couldn't triage your{' '}
                  {props.variant() === 'email' ? 'email' : 'inbox'} right now.
                </span>
                <Button variant="base" size="sm" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            </Match>

            <Match when={items().length === 0}>
              <div class="border-edge-muted border-t px-3 py-2.5 text-ink-muted text-sm">
                Nothing needs your attention right now.
              </div>
            </Match>

            <Match when={items().length > 0}>
              <For each={visibleItems()}>
                {(item, index) => (
                  <div class="group flex items-center gap-3 border-edge-muted border-t px-3 py-2 hover:bg-hover/30">
                    <span class="w-4 shrink-0 text-center font-medium text-ink-extra-muted text-xs tabular-nums">
                      {index() + 1}
                    </span>
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-left"
                      onClick={() => void openItem(item)}
                    >
                      <div class="truncate font-medium text-sm">
                        {resolve(item)?.name || item.title}
                      </div>
                      <div class="truncate text-ink-muted text-xs">
                        {item.reason}
                      </div>
                    </button>
                    <Button
                      variant="base"
                      size="sm"
                      class="max-w-48 shrink-0"
                      tooltip={item.suggested_action}
                      onClick={() => void runAction(item)}
                    >
                      <SparkleIcon class="size-3 shrink-0" />
                      <span class="truncate text-xs">
                        {item.suggested_action}
                      </span>
                    </Button>
                  </div>
                )}
              </For>
              <Show when={hiddenCount() > 0 || expanded()}>
                <button
                  type="button"
                  class="flex h-8 w-full items-center justify-center border-edge-muted border-t text-ink-muted text-xs hover:bg-hover/30"
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  {expanded() ? 'Show less' : `Show all ${items().length}`}
                </button>
              </Show>
            </Match>
          </Switch>
        </Show>
      </section>
    </Show>
  );
}
