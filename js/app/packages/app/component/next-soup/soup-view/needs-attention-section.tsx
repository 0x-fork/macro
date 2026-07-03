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
import { cn, Layer } from '@ui';
import {
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Suspense,
  Switch,
} from 'solid-js';

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

function SkeletonRows() {
  const Row = () => (
    <div class="flex flex-col gap-1.5 px-4 py-2.5">
      <div class="skeleton-shimmer h-3.5 w-2/5 rounded-full bg-edge-muted/50" />
      <div class="flex items-center gap-2">
        <div class="skeleton-shimmer size-4 shrink-0 rounded bg-edge-muted/50" />
        <div class="skeleton-shimmer h-3 w-3/5 rounded-full bg-edge-muted/50" />
      </div>
    </div>
  );
  return (
    <>
      <Row />
      <Row />
      <Row />
    </>
  );
}

/**
 * AI-triage section rendered above the inbox/email list: the 5-10 items that
 * most need the user's attention, each with a reason and a suggested next
 * step. Backed by the `needs-attention` AI projections (cached server-side,
 * refreshed in the background, pushed over the connection gateway).
 *
 * Shows three items by default and expands to the full set. Rows open the
 * underlying entity; the trailing pill hands the suggested step to a fresh AI
 * chat with the item attached (e.g. drafting the reply). The section is not a
 * soup row, so j/k list navigation is unaffected.
 *
 * All query-data reads live under the section's own `<Suspense>` boundary —
 * solid-query suspends the nearest boundary while fetching, and without a
 * local one the section would suspend the soup list's boundary and remount
 * the whole list.
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
  /** Server-side generation in flight with nothing to show yet. Only read
   * under the Suspense boundary (touches query data). */
  const showSkeleton = () =>
    (active()?.isGenerating() ?? false) && !active()?.hasResult();

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
      <div class="pb-1">
        {/* Header pill, mirroring SoupSectionHeader's styling (imported
            directly it would cycle back into soup-view.tsx). Keeps to local
            state only — query-data reads would suspend outside the boundary
            below. */}
        <Layer depth={2}>
          <div
            class={cn(
              'group/header relative mx-1 my-0.5 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2 py-2 font-semibold text-xs tracking-tight',
              'relative border border-edge-muted bg-surface text-text-muted'
            )}
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              onClick={() => setCollapsed((prev) => !prev)}
            >
              <SparkleIcon class="size-3.5 shrink-0 text-accent" />
              <span class="truncate">Needs your attention</span>
              <CaretDownIcon
                class={cn(
                  'size-3 shrink-0 text-ink-extra-muted transition-transform duration-200',
                  collapsed() && '-rotate-90'
                )}
              />
            </button>
            <button
              type="button"
              title="Regenerate"
              class="shrink-0 rounded-md p-1 text-ink-muted hover:bg-active"
              disabled={refreshing()}
              onClick={() => void refresh()}
            >
              <ArrowClockwiseIcon
                class={cn('size-3.5', refreshing() && 'animate-spin')}
              />
            </button>
          </div>
        </Layer>

        <Show when={!collapsed()}>
          <Suspense fallback={<SkeletonRows />}>
            <Switch>
              <Match when={showSkeleton()}>
                <SkeletonRows />
              </Match>

              <Match when={active()?.error() && items().length === 0}>
                <div class="flex items-center gap-3 px-4 py-2.5 text-ink-muted text-sm">
                  <span class="min-w-0 flex-1 truncate">
                    Couldn't triage your{' '}
                    {props.variant() === 'email' ? 'email' : 'inbox'} right now.
                  </span>
                  <button
                    type="button"
                    class="shrink-0 rounded-md px-2 py-1 text-xs hover:bg-active"
                    onClick={() => void refresh()}
                  >
                    Retry
                  </button>
                </div>
              </Match>

              <Match when={items().length === 0}>
                <div class="px-4 py-2.5 text-ink-muted text-sm">
                  Nothing needs your attention right now.
                </div>
              </Match>

              <Match when={items().length > 0}>
                <For each={visibleItems()}>
                  {(item) => (
                    <div class="group flex items-center gap-3 px-4 py-1 hover:bg-hover/30">
                      <button
                        type="button"
                        class="min-w-0 flex-1 py-1.5 text-left"
                        onClick={() => void openItem(item)}
                      >
                        <div class="truncate font-semibold text-ink text-sm">
                          {resolve(item)?.name || item.title}
                        </div>
                        <div class="mt-1 flex items-center gap-2">
                          <span class="flex size-4 shrink-0 items-center justify-center rounded bg-accent/15">
                            <SparkleIcon class="size-2.5 text-accent" />
                          </span>
                          <span class="truncate text-ink-muted text-sm">
                            {item.reason}
                          </span>
                        </div>
                      </button>
                      <button
                        type="button"
                        title={item.suggested_action}
                        class="flex max-w-44 shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-ink-extra-muted text-xs opacity-70 transition hover:bg-accent/10 hover:text-accent group-hover:opacity-100"
                        onClick={() => void runAction(item)}
                      >
                        <SparkleIcon class="size-3 shrink-0" />
                        <span class="truncate">{item.suggested_action}</span>
                      </button>
                    </div>
                  )}
                </For>
                <Show when={hiddenCount() > 0 || expanded()}>
                  <button
                    type="button"
                    class="w-full px-4 py-1.5 text-left text-ink-extra-muted text-xs hover:text-ink-muted"
                    onClick={() => setExpanded((prev) => !prev)}
                  >
                    {expanded() ? 'Show less' : `Show all ${items().length}`}
                  </button>
                </Show>
              </Match>
            </Switch>
          </Suspense>
        </Show>
      </div>
    </Show>
  );
}
