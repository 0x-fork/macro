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
import { createEffect, type JSX, Show } from 'solid-js';
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

function NotificationStackRow(props: {
  stack: NotificationStack;
  entity: EntityData;
  onClick?: (e: PointerEvent | MouseEvent | KeyboardEvent) => void;
  content?: JSX.Element;
}) {
  const notificationSource = useGlobalNotificationSource();
  const unread = () => isNotificationUnread(props.stack);

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
              'flex py-1.5 px-2 gap-3 hover:bg-hover/20 rounded-xs min-w-0 overflow-hidden cursor-pointer group/notification-row transition-colors'
            )}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e);
              }
              if (e.key === 'e') {
                e.preventDefault();
                e.stopPropagation();
                handleMarkAsDone();
              }
            }}
          >
            <div class="flex items-center justify-center w-4 shrink-0">
              <UnreadIndicator active={unread()} />
            </div>
            <div class="shrink-0">
              <NotificationIcon stack={props.stack} class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 text-sm min-w-0">
                <div class="shrink-0">
                  <NotificationSenderIcon stack={props.stack} size="xs" />
                </div>
                <span class="ph-no-capture truncate min-w-0">
                  <NotificationDescription stack={props.stack} />
                </span>
                <span class="text-xs text-ink-extra-muted shrink-0 ml-auto">
                  <NotificationTimestamp stack={props.stack} />
                </span>
                <Button
                  onClick={handleMarkAsDone}
                  tooltip="Mark done"
                  class="opacity-0 group-hover/notification-row:opacity-100 border border-edge-muted text-xs text-ink-muted grid p-0 place-items-center size-5 shrink-0"
                >
                  <CheckIcon class="size-3" />
                </Button>
              </div>
              <div class="ph-no-capture text-xs text-ink-muted truncate mt-0.5">
                <NotificationContent stack={props.stack} singleLine />
              </div>
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <div onClick={(e) => e.stopPropagation()}>
            <ContextMenuContent class="text-xs text-ink-muted">
              <MenuItem text="Mark Done" onClick={() => handleMarkAsDone()} />
              <MenuItem text="Mark Read" onClick={handleMarkAsRead} />
              <MenuItem text="Copy Link" onClick={handleCopyLink} />
            </ContextMenuContent>
          </div>
        </ContextMenu.Portal>
      </ContextMenu>
    </Layer>
  );
}

export function NotificationStacks(props: NotificationStacksProps) {
  const notifications = () => props.entity.notifications?.() ?? [];
  const validNotifications = () =>
    filterNotDoneNotifications(filterValidNotifications(notifications()));

  const [stacks, setStacks] = createStore<NotificationStack[]>([]);

  createEffect(() => {
    const newStacks = stackNotifications(validNotifications());
    setStacks(reconcile(newStacks, { key: 'id', merge: false }));
  });

  return (
    <Show when={stacks.length > 0}>
      <CollapsibleList
        items={stacks}
        visibleCount={props.visibleCount ?? DEFAULT_VISIBLE_COUNT}
        togglePosition="bottom"
      >
        {(stack) => (
          <NotificationStackRow
            stack={stack}
            entity={props.entity}
            onClick={props.onClick}
          />
        )}
      </CollapsibleList>
    </Show>
  );
}
