import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import { globalSplitManager } from '@app/signal/splitLayout';
import { ContextMenuContent, MenuItem } from '@core/component/Menu';
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
              'flex p-2 pr-0 my-1 border-l-2 border-edge bg-message gap-4 hover:bg-hover min-w-0 overflow-hidden'
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
            <div class="pt-1 shrink-0">
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
                <Show when={canMarkDone()}>
                  <div class="ml-auto flex items-center gap-1 pr-2 shrink-0">
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
              <div
                class={cn('ph-no-capture mt-1 min-w-0 text-xs', {
                  'truncate overflow-hidden':
                    props.stack.type !== 'document_mention' && !props.content,
                })}
              >
                {props.content ?? <NotificationContent stack={props.stack} />}
              </div>
            </div>
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
    <div class="group relative pl-6">
      {/* Vertical rail */}
      <Show when={!props.isLast}>
        <div class="absolute left-0 top-0 bottom-0 border-l border-ink/15" />
      </Show>
      {/* Curved connector */}
      <div class="absolute left-0 top-0 w-4 h-4 text-ink/15">
        <svg viewBox="0 0 16 16" fill="none" class="size-full">
          <path
            d="M0 0 L0 10 Q0 14 4 14 L16 14"
            stroke="currentColor"
            stroke-width="1"
            fill="none"
          />
        </svg>
      </div>
      {/* Content */}
      <div
        class="min-w-0 mb-2 p-2 cursor-pointer rounded-md bg-ink/5 hover:bg-ink/10 transition-colors"
        onClick={handleClick}
        role="button"
        tabIndex={0}
      >
        <div class="flex items-center gap-2 text-xs">
          <NotificationSenderIcon stack={props.stack} size="sm" />
          <span class="ph-no-capture truncate font-medium text-ink">
            <NotificationDescription stack={props.stack} />
          </span>
          <span class="text-ink-extra-muted shrink-0 ml-auto">
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
        <div class="ph-no-capture text-xs text-ink-muted mt-1 line-clamp-2">
          <NotificationContent stack={props.stack} singleLine />
        </div>
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
        <div class="flex flex-col">
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
            <div class="relative pl-6">
              <div class="absolute left-0 top-0 h-3 border-l border-ink/15" />
              <button
                type="button"
                class="text-xs text-ink-muted hover:text-ink hover:bg-ink/5 px-2 py-1 rounded-md transition-colors"
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
