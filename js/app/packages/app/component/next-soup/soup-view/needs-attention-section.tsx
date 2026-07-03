import { openChatWithMessageAndAttachments } from '@app/component/ChatWithAgentButton';
import type { GroupHeaderProps } from '@app/component/next-soup/create-soup-state';
import type { Attachment } from '@core/component/AI/types';
import ArrowClockwiseIcon from '@phosphor/arrow-clockwise.svg';
import CaretRightIcon from '@phosphor/caret-right.svg';
import SparkleIcon from '@phosphor/sparkle.svg';
import type {
  AttentionItem,
  NeedsAttentionVariant,
} from '@queries/ai/needs-attention';
import { EntityType } from '@service-cognition/generated/schemas/entityType';
import { cn, Layer } from '@ui';
import { type Accessor, Show } from 'solid-js';

/** Synthetic group key for the triage section's rows in the soup pipeline. */
export const ATTENTION_GROUP_KEY = 'needs-attention';

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

/** Hands the item's suggested action to a fresh AI chat with the item
 * attached (e.g. drafting the reply via the SendEmail tool). */
async function runSuggestedAction(
  variant: NeedsAttentionVariant,
  item: AttentionItem
) {
  const attachment = toAttachment(item);
  await openChatWithMessageAndAttachments(
    buildActionPrompt(variant, item),
    attachment ? [attachment] : []
  );
}

/** The SoupSectionHeader pill styling, replicated: importing it from
 * soup-view.tsx would create an import cycle (soup-view -> soup-view-context
 * -> this file). */
const HEADER_PILL_CLASS =
  'group/header relative mx-1 my-0.5 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg border border-edge-muted bg-surface px-2 py-2 font-semibold text-text-muted text-xs tracking-tight';

/**
 * Group header for the "Needs your attention" section, rendered through
 * `GroupMeta.renderHeader` so it rides the normal grouped-row pipeline
 * (navigable with j/k, collapsible with h/l) while adding the sparkle marker
 * and a regenerate control.
 */
export const AttentionGroupHeader = (
  props: GroupHeaderProps & {
    highlighted?: boolean;
    refreshing: Accessor<boolean>;
    onRefresh: () => void;
  }
) => {
  return (
    <Layer depth={2}>
      <div
        data-highlighted={props.highlighted || undefined}
        class={cn(HEADER_PILL_CLASS, props.highlighted && 'bg-active')}
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          onClick={() => props.group.toggle()}
        >
          <Layer depth={3}>
            <div class="flex size-4.5 items-center justify-center rounded-xs group-hover/header:bg-ink/5">
              <CaretRightIcon
                class={cn('size-2.5', {
                  'rotate-90': props.group.isExpanded(),
                })}
              />
            </div>
          </Layer>
          <SparkleIcon class="size-3.5 shrink-0 text-accent" />
          <span class="truncate">{props.group.label}</span>
          <span class="shrink-0 rounded-full bg-ink/10 px-1.5 py-px font-medium text-ink-extra-muted text-xs tabular-nums">
            {props.group.count}
          </span>
        </button>
        <button
          type="button"
          title="Regenerate"
          class="ml-auto shrink-0 rounded-xs p-1 text-ink-muted hover:bg-ink/5"
          disabled={props.refreshing()}
          onClick={() => props.onRefresh()}
        >
          <ArrowClockwiseIcon
            class={cn('size-3', props.refreshing() && 'animate-spin')}
          />
        </button>
      </div>
    </Layer>
  );
};

/**
 * Loading placeholder shown while the triage projection generates with no
 * cached result yet: the section header pill plus three shimmering rows.
 */
export function AttentionSkeleton() {
  const Row = () => (
    <div class="flex items-center gap-3 px-3 py-2.5">
      <div class="skeleton-shimmer size-8 shrink-0 rounded-md bg-edge-muted/50" />
      <div class="min-w-0 flex-1 space-y-1.5">
        <div class="skeleton-shimmer h-3 w-2/5 rounded-full bg-edge-muted/50" />
        <div class="skeleton-shimmer h-2.5 w-3/5 rounded-full bg-edge-muted/50" />
      </div>
    </div>
  );
  return (
    <div>
      <Layer depth={2}>
        <div class={HEADER_PILL_CLASS}>
          <SparkleIcon class="size-3.5 shrink-0 text-accent" />
          <span class="truncate">Needs your attention</span>
          <ArrowClockwiseIcon class="ml-auto size-3 shrink-0 animate-spin text-ink-extra-muted" />
        </div>
      </Layer>
      <Row />
      <Row />
      <Row />
    </div>
  );
}

/**
 * The "why + suggested action" line rendered directly beneath an attention
 * row. The row itself is a normal soup entity row; this line carries the
 * triage reasoning and a one-click hand-off of the suggested step to an AI
 * chat with the item attached.
 */
export const AttentionReasonLine = (props: {
  variant: NeedsAttentionVariant;
  item: Accessor<AttentionItem | undefined>;
}) => {
  return (
    <Show when={props.item()}>
      <div class="flex items-center gap-2 py-0.5 pr-4 pl-13">
        <span class="min-w-0 flex-1 truncate text-ink-muted text-xs">
          {props.item()?.reason}
        </span>
        <button
          type="button"
          title={props.item()?.suggested_action}
          class="flex max-w-48 shrink-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-ink-extra-muted text-xs transition hover:bg-accent/10 hover:text-accent"
          onClick={() => {
            const item = props.item();
            if (item) void runSuggestedAction(props.variant, item);
          }}
        >
          <SparkleIcon class="size-3 shrink-0" />
          <span class="truncate">{props.item()?.suggested_action}</span>
        </button>
      </div>
    </Show>
  );
};
