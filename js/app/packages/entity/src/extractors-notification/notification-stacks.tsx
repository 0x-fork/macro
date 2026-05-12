import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ContextMenuContent, MenuItem } from '@core/component/Menu';
import { isMobile } from '@core/mobile/isMobile';
import { toast } from '@core/component/Toast/Toast';
import { buildSimpleEntityUrl } from '@core/util/url';
import CheckIcon from '@icon/regular/check.svg';
import { ContextMenu } from '@kobalte/core/context-menu';
import {
  getChannelNotificationParams,
  getMostRecentNotification,
  type NotificationStack,
  openNotification,
  stackNotifications,
} from '@notifications';
import type { UnifiedNotification } from '@notifications';
import { Button } from '@ui/components/Button';
import { Layer } from '@ui/components/Layer';
import { cn } from '@ui/utils/classname';
import { createEffect, createSignal, For, type JSX, Show } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { CollapsibleList } from '../components/CollapsibleList';
import { UnreadIndicator } from '../components/UnreadIndicator';
import type { EntityData } from '../types/entity';
import type { WithNotification } from '../types/notification';
import {
  filterNotDoneNotifications,
  filterValidNotifications,
  isNotificationUnread,
} from '../utils/notification';
import { useNotificationStackActions } from './notification-actions';
import { NotificationContent } from './notification-content';
import { NotificationDescription } from './notification-description';
import { NotificationIcon } from './notification-icon';
import { NotificationSenderIcon } from './notification-sender-icon';
import { NotificationTimestamp } from './notification-timestamp';

const DEFAULT_VISIBLE_COUNT = 3;

function getNotificationUrl(notification: UnifiedNotification): string {
  const { params } = getChannelNotificationParams(notification);
  return buildSimpleEntityUrl(
    { type: notification.entity_type, id: notification.entity_id },
    params
  );
}

interface NotificationStacksProps {
  entity: WithNotification<EntityData>;
  onClick?: (e: PointerEvent | MouseEvent | KeyboardEvent) => void;
  visibleCount?: number;
}

export function NotificationStackRow(props: {
  stack: NotificationStack;
  entity: EntityData;
  onClick?: (e: PointerEvent | MouseEvent | KeyboardEvent) => void;
  content?: JSX.Element;
  showMarkDone?: boolean;
}) {
  const notificationSource = useGlobalNotificationSource();
  const unread = () => isNotificationUnread(props.stack);
  const canMarkDone = () =>
    props.showMarkDone !== false && props.stack.type !== 'call-started';

  const { markStackAsDone, markStackAsRead } = useNotificationStackActions({
    stack: props.stack,
    entityId: props.entity.id,
  });

  const handleClick = async (e: PointerEvent | MouseEvent | KeyboardEvent) => {
    const mostRecent = getMostRecentNotification(props.stack);
    const splitManager = globalSplitManager();
    if (!splitManager) return;

    e.stopPropagation();
    const entity = props.entity;
    const entityOverride = {
      fileType: 'fileType' in entity ? entity.fileType : undefined,
      subType: 'subType' in entity ? entity.subType : undefined,
    };
    await openNotification(
      mostRecent,
      splitManager,
      e.shiftKey,
      entityOverride
    );
    await notificationSource.markAsRead(mostRecent);
    props.onClick?.(e);
  };

  const handleMarkAsDone = (e?: PointerEvent | MouseEvent) => {
    e?.stopPropagation();
    markStackAsDone();
  };

  const handleMarkAsRead = async () => {
    await markStackAsRead();
  };

  const handleCopyLink = async () => {
    const mostRecent = getMostRecentNotification(props.stack);
    const url = getNotificationUrl(mostRecent);
    await navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  };

  return (
    <Layer depth={0}>
      <ContextMenu>
        <ContextMenu.Trigger class="size-full">
          <div
            class={cn(
              'relative flex p-2 my-1 border-l-2 border-edge bg-message gap-2 hover:bg-hover min-w-0 overflow-hidden'
            )}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e);
              }
              if (e.key === 'e' && canMarkDone()) {
                e.preventDefault();
                e.stopPropagation();
                handleMarkAsDone();
              }
            }}
          >
            <div class="pt-0.5 shrink-0 text-ink-muted">
              <NotificationIcon stack={props.stack} class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1 text-xs min-w-0 overflow-hidden">
                <span
                  class={cn(
                    'w-0 transition-[width] overflow-hidden duration-500 ease shrink-0',
                    {
                      'w-4': unread(),
                    }
                  )}
                >
                  <UnreadIndicator active />
                </span>
                <div class="shrink-0">
                  <NotificationSenderIcon stack={props.stack} size="xs" />
                </div>
                <span class="ph-no-capture truncate min-w-0">
                  <NotificationDescription stack={props.stack} />
                </span>
                <span class="text-ink-extra-muted/50 shrink-0">
                  {' - '}
                  <NotificationTimestamp stack={props.stack} />
                </span>
              </div>
              <div
                class={cn('ph-no-capture mt-1 min-w-0 text-xs', {
                  'truncate overflow-hidden':
                    props.stack.type !== 'document_mention' && !props.content,
                })}
              >
                {props.content ?? <NotificationContent stack={props.stack} />}
              </div>
            </div>
            <Show when={canMarkDone()}>
              <div class="absolute bottom-2 right-2">
                <Button
                  onClick={handleMarkAsDone}
                  tooltip={'Mark notification done'}
                  class="border border-edge-muted text-xs text-ink-muted grid p-0 place-items-center size-6"
                >
                  <CheckIcon class="size-3" />
                </Button>
              </div>
            </Show>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <div onClick={(e) => e.stopPropagation()}>
            <ContextMenuContent class="text-xs text-ink-muted">
              <Show when={canMarkDone()}>
                <MenuItem text="Mark Done" onClick={() => handleMarkAsDone()} />
              </Show>
              <MenuItem text="Mark Read" onClick={handleMarkAsRead} />
              <MenuItem text="Copy Link" onClick={handleCopyLink} />
            </ContextMenuContent>
          </div>
        </ContextMenu.Portal>
      </ContextMenu>
    </Layer>
  );
}

/** Compact pill variant - single line with all info inline */
export function CompactPillRow(props: {
  stack: NotificationStack;
  entity: EntityData;
  onClick?: (e: PointerEvent | MouseEvent | KeyboardEvent) => void;
}) {
  const notificationSource = useGlobalNotificationSource();
  const unread = () => isNotificationUnread(props.stack);

  const { markStackAsDone } = useNotificationStackActions({
    stack: props.stack,
    entityId: props.entity.id,
  });

  const handleClick = async (e: PointerEvent | MouseEvent | KeyboardEvent) => {
    const mostRecent = getMostRecentNotification(props.stack);
    const splitManager = globalSplitManager();
    if (!splitManager) return;

    e.stopPropagation();
    const entity = props.entity;
    const entityOverride = {
      fileType: 'fileType' in entity ? entity.fileType : undefined,
      subType: 'subType' in entity ? entity.subType : undefined,
    };
    await openNotification(mostRecent, splitManager, e.shiftKey, entityOverride);
    await notificationSource.markAsRead(mostRecent);
    props.onClick?.(e);
  };

  return (
    <div
      class="group flex items-center gap-2 px-2 py-1 rounded-md border border-edge-muted bg-panel hover:bg-hover text-xs cursor-pointer transition-colors"
      onClick={handleClick}
      role="button"
      tabIndex={0}
    >
      <Show when={unread()}>
        <UnreadIndicator active />
      </Show>
      <NotificationIcon stack={props.stack} class="size-3.5 shrink-0" />
      <div class="shrink-0">
        <NotificationSenderIcon stack={props.stack} size="xs" />
      </div>
      <span class="ph-no-capture truncate min-w-0 flex-1 text-ink-muted">
        <NotificationContent stack={props.stack} singleLine />
      </span>
      <span class="text-ink-extra-muted shrink-0">
        <NotificationTimestamp stack={props.stack} />
      </span>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          markStackAsDone();
        }}
        tooltip="Mark done"
        class="opacity-0 group-hover:opacity-100 border border-edge-muted text-ink-muted p-0 size-5 grid place-items-center transition-opacity"
      >
        <CheckIcon class="size-2.5" />
      </Button>
    </div>
  );
}

/** Collapsed summary variant - shows count, expands to full list */
export function CollapsedSummaryStacks(props: NotificationStacksProps) {
  const notifications = () => props.entity.notifications?.() ?? [];
  const validNotifications = () =>
    filterNotDoneNotifications(filterValidNotifications(notifications()));
  const [stacks, setStacks] = createStore<NotificationStack[]>([]);
  const [expanded, setExpanded] = createSignal(false);

  createEffect(() => {
    const newStacks = stackNotifications(validNotifications());
    setStacks(reconcile(newStacks, { key: 'id', merge: false }));
  });

  const totalCount = () =>
    stacks.reduce((sum, s) => sum + s.notifications.length, 0);

  const uniqueSenders = () => {
    const senders = new Set<string>();
    for (const stack of stacks) {
      for (const n of stack.notifications) {
        if (n.sender_name) senders.add(n.sender_name);
      }
    }
    return Array.from(senders).slice(0, 3);
  };

  const summaryText = () => {
    const count = totalCount();
    const senders = uniqueSenders();
    if (senders.length === 0) return `${count} notification${count > 1 ? 's' : ''}`;
    if (senders.length === 1) return `${count} from ${senders[0]}`;
    if (senders.length === 2) return `${count} from ${senders[0]} and ${senders[1]}`;
    return `${count} from ${senders[0]}, ${senders[1]} +${senders.length - 2}`;
  };

  return (
    <Show when={stacks.length > 0}>
      <div class="flex flex-col gap-1">
        <button
          type="button"
          class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/10 hover:bg-accent/15 text-xs text-accent transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded());
          }}
        >
          <span class="size-2 rounded-full bg-accent" />
          <span class="font-medium">{summaryText()}</span>
          <span class="text-accent/70 ml-auto">
            {expanded() ? 'Hide' : 'Show'}
          </span>
        </button>
        <Show when={expanded()}>
          <div class="flex flex-col gap-1 pl-2 border-l-2 border-accent/30">
            <For each={stacks}>
              {(stack) => (
                <CompactPillRow
                  stack={stack}
                  entity={props.entity}
                  onClick={props.onClick}
                />
              )}
            </For>
          </div>
        </Show>
      </div>
    </Show>
  );
}

/** Timeline variant - vertical line connecting notifications */
function TimelineRow(props: {
  stack: NotificationStack;
  entity: EntityData;
  onClick?: (e: PointerEvent | MouseEvent | KeyboardEvent) => void;
  isLast?: boolean;
}) {
  const notificationSource = useGlobalNotificationSource();

  const { markStackAsDone } = useNotificationStackActions({
    stack: props.stack,
    entityId: props.entity.id,
  });

  const handleClick = async (e: PointerEvent | MouseEvent | KeyboardEvent) => {
    const mostRecent = getMostRecentNotification(props.stack);
    const splitManager = globalSplitManager();
    if (!splitManager) return;

    e.stopPropagation();
    const entity = props.entity;
    const entityOverride = {
      fileType: 'fileType' in entity ? entity.fileType : undefined,
      subType: 'subType' in entity ? entity.subType : undefined,
    };
    await openNotification(mostRecent, splitManager, e.shiftKey, entityOverride);
    await notificationSource.markAsRead(mostRecent);
    props.onClick?.(e);
  };

  return (
    <div class="group relative">
      {/* Vertical rail - only continues if not last */}
      <Show when={!props.isLast}>
        <div class="absolute -left-6 top-0 bottom-0 border-l border-edge" />
      </Show>
      {/* Curved connector */}
      <div class="absolute -left-6 top-2 w-6 h-4 text-edge">
        <svg viewBox="0 0 24 16" fill="none" class="size-full">
          <path
            d="M0 0 L0 10 Q0 14 4 14 L24 14"
            stroke="currentColor"
            stroke-width="1"
            fill="none"
          />
        </svg>
      </div>
      {/* Content */}
      <div
        class={cn("relative min-w-0 py-2 cursor-pointer hover:bg-ink/5 group/row", isMobile() ? "pr-2" : "pr-8")}
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <Show
          when={isMobile()}
          fallback={
            <div class="flex items-center gap-2 text-xs">
              <NotificationSenderIcon stack={props.stack} size="xs" />
              <span class="ph-no-capture shrink-0 font-medium text-ink">
                <NotificationDescription stack={props.stack} />
              </span>
              <span class="text-ink-extra-muted">·</span>
              <span class="ph-no-capture truncate text-ink-extra-muted">
                <NotificationContent stack={props.stack} singleLine />
              </span>
              <span class="text-ink-extra-muted/50 shrink-0 ml-auto">
                <NotificationTimestamp stack={props.stack} />
              </span>
            </div>
          }
        >
          <div class="flex flex-col gap-1 text-xs">
            <div class="flex items-center gap-2 min-w-0">
              <NotificationSenderIcon stack={props.stack} size="xs" />
              <span class="ph-no-capture truncate font-medium text-ink min-w-0">
                <NotificationDescription stack={props.stack} />
              </span>
              <span class="text-ink-extra-muted/50 shrink-0 ml-auto whitespace-nowrap">
                <NotificationTimestamp stack={props.stack} />
              </span>
            </div>
            <span class="ph-no-capture truncate text-ink-extra-muted">
              <NotificationContent stack={props.stack} singleLine />
            </span>
          </div>
        </Show>
        <Button
          onClick={(e) => {
            e.stopPropagation();
            markStackAsDone();
          }}
          tooltip="Mark done"
          class="absolute top-1/2 -translate-y-1/2 right-1 opacity-0 group-hover/row:opacity-100 bg-edge-muted! hover:bg-edge! text-ink-muted p-0 size-5 grid place-items-center rounded"
        >
          <CheckIcon class="size-2.5" />
        </Button>
      </div>
    </div>
  );
}

type StackVariant = 'default' | 'compact' | 'collapsed' | 'timeline';

export function NotificationStacks(
  props: NotificationStacksProps & { variant?: StackVariant }
) {
  const notifications = () => props.entity.notifications?.() ?? [];
  const validNotifications = () =>
    filterNotDoneNotifications(filterValidNotifications(notifications()));
  const [stacks, setStacks] = createStore<NotificationStack[]>([]);

  createEffect(() => {
    const newStacks = stackNotifications(validNotifications());
    setStacks(reconcile(newStacks, { key: 'id', merge: false }));
  });

  // Collapsed variant uses its own component
  if (props.variant === 'collapsed') {
    return <CollapsedSummaryStacks {...props} />;
  }

  // Timeline variant needs special handling for isLast prop
  if (props.variant === 'timeline') {
    const [showMore, setShowMore] = createSignal(false);
    const baseVisibleCount = () => props.visibleCount ?? DEFAULT_VISIBLE_COUNT;
    const visibleStacks = () =>
      showMore() ? stacks : stacks.slice(0, baseVisibleCount());
    const hasMore = () => stacks.length > baseVisibleCount();
    const hiddenCount = () => stacks.length - baseVisibleCount();

    return (
      <Show when={stacks.length > 0}>
        <div class="relative flex flex-col pl-6">
          {/* Leading vertical connector from icon area */}
          <div class="absolute left-0 top-0 h-6 border-l border-edge" />
          <For each={visibleStacks()}>
            {(stack, index) => (
              <TimelineRow
                stack={stack}
                entity={props.entity}
                onClick={props.onClick}
                isLast={index() === visibleStacks().length - 1 && !hasMore()}
              />
            )}
          </For>
          <Show when={hasMore()}>
            <div class="relative py-2">
              {/* Vertical rail - stops at curve */}
              <div class="absolute -left-6 top-0 h-4 border-l border-edge" />
              {/* Curved connector */}
              <div class="absolute -left-6 top-2 w-6 h-4 text-edge">
                <svg viewBox="0 0 24 16" fill="none" class="size-full">
                  <path
                    d="M0 0 L0 10 Q0 14 4 14 L24 14"
                    stroke="currentColor"
                    stroke-width="1"
                    fill="none"
                  />
                </svg>
              </div>
              <button
                type="button"
                class="text-xs text-ink-muted border border-edge-muted rounded-full px-2 py-0.5 hover:text-accent hover:border-accent/50 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMore(!showMore());
                }}
              >
                {showMore() ? 'Show less' : `+${hiddenCount()} more`}
              </button>
            </div>
          </Show>
        </div>
      </Show>
    );
  }

  const RowComponent =
    props.variant === 'compact' ? CompactPillRow : NotificationStackRow;

  return (
    <Show when={stacks.length > 0}>
      <CollapsibleList
        items={stacks}
        visibleCount={props.visibleCount ?? DEFAULT_VISIBLE_COUNT}
        togglePosition="bottom"
      >
        {(stack) => (
          <RowComponent
            stack={stack}
            entity={props.entity}
            onClick={props.onClick}
          />
        )}
      </CollapsibleList>
    </Show>
  );
}
