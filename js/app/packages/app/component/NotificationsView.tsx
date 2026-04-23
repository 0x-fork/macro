import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@app/component/GlobalAppState';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { SplitPanelContext } from '@app/component/split-layout/context';
import { globalSplitManager } from '@app/signal/splitLayout';
import type { BlockName } from '@core/block';
import { ContextMenuContent, MenuItem } from '@core/component/Menu';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { toast } from '@core/component/Toast/Toast';
import { buildSimpleEntityUrl } from '@core/util/url';
import CheckIcon from '@icon/regular/check.svg';
import { ContextMenu } from '@kobalte/core/context-menu';
import {
  CHANNEL_EVENT_TYPES,
  getChannelNotificationParams,
  getMostRecentNotification,
  type NotificationStack,
  openNotification,
  stackNotifications,
} from '@notifications';
import type { UnifiedNotification } from '@notifications';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { Button } from '@ui/components/Button';
import { cn } from '@ui/utils/classname';
import { createEffect, createMemo, createSignal, Show, Suspense } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { VList } from 'virtua/solid';
import { isNotificationUnread } from '@entity/utils/notification';
import { useNotificationStackActions } from '@entity/extractors-notification/notification-actions';
import { NotificationContent } from '@entity/extractors-notification/notification-content';
import { NotificationDescription } from '@entity/extractors-notification/notification-description';
import { NotificationIcon } from '@entity/extractors-notification/notification-icon';
import { NotificationSenderIcon } from '@entity/extractors-notification/notification-sender-icon';
import { NotificationTimestamp } from '@entity/extractors-notification/notification-timestamp';
import { MultiSelectCheckbox } from '@entity/components/MultiSelectCheckbox';
import { UnreadIndicator } from '@entity/components/UnreadIndicator';

function getNotificationUrl(notification: UnifiedNotification): string {
  const { params } = getChannelNotificationParams(notification);
  return buildSimpleEntityUrl(
    { type: notification.entity_type, id: notification.entity_id },
    params
  );
}

function NotificationRow(props: {
  stack: NotificationStack;
  highlighted?: boolean;
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  onMouseEnter?: () => void;
}) {
  const notificationSource = useGlobalNotificationSource();
  const unread = () => isNotificationUnread(props.stack);

  const { markStackAsDone, markStackAsRead } = useNotificationStackActions({
    stack: props.stack,
  });

  const handleClick = async (e: PointerEvent | MouseEvent | KeyboardEvent) => {
    const mostRecent = getMostRecentNotification(props.stack);
    const splitManager = globalSplitManager();
    if (!splitManager) return;

    e.stopPropagation();
    await openNotification(mostRecent, splitManager, e.shiftKey);
    await notificationSource.markAsRead(mostRecent);
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
    <ContextMenu>
      <ContextMenu.Trigger class="w-full">
        <div
          class={cn(
            'relative w-full rounded-xs cursor-pointer group/notification-row',
            props.highlighted ? 'bg-accent/5' : 'hover:bg-hover/10'
          )}
          onClick={handleClick}
          onMouseEnter={props.onMouseEnter}
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
          <div
            class={cn(
              'absolute h-full w-[3px] left-0 top-0 bg-accent rounded-r-full',
              props.highlighted ? 'opacity-100' : 'opacity-0'
            )}
          />
          <div
            class={cn('flex p-2 px-4 gap-3 min-w-0', {
              'opacity-60': !unread(),
            })}
          >
            <div class="flex items-center justify-center w-6 pt-1 shrink-0 relative group/checkbox">
              <UnreadIndicator
                active={unread()}
                class={cn(
                  props.checked && 'opacity-0',
                  'group-hover/checkbox:opacity-0'
                )}
              />
              <div
                class={cn(
                  'absolute inset-0 grid place-items-center',
                  props.checked
                    ? 'opacity-100'
                    : 'opacity-0 group-hover/checkbox:opacity-100'
                )}
              >
                <MultiSelectCheckbox
                  checked={props.checked}
                  onChecked={props.onChecked}
                />
              </div>
            </div>
            <div class="shrink-0 pt-1">
              <NotificationIcon stack={props.stack} class="size-4" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 min-w-0">
                <div class="shrink-0">
                  <NotificationSenderIcon stack={props.stack} size="xs" />
                </div>
                <span class="ph-no-capture text-sm truncate min-w-0 font-medium">
                  <NotificationDescription stack={props.stack} />
                </span>
                <span class="text-xs text-ink-extra-muted shrink-0 ml-auto">
                  <NotificationTimestamp stack={props.stack} />
                </span>
                <Button
                  onClick={handleMarkAsDone}
                  tooltip="Mark done"
                  class="opacity-0 group-hover/notification-row:opacity-100 border border-edge-muted text-xs text-ink-muted grid p-0 place-items-center size-6 shrink-0"
                >
                  <CheckIcon class="size-3" />
                </Button>
              </div>
              <div class="ph-no-capture mt-1 text-ink-muted text-sm truncate">
                <NotificationContent stack={props.stack} singleLine />
              </div>
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
  );
}

function resolveNotificationBlock(
  notification: UnifiedNotification
): { type: BlockName; id: string } | null {
  const meta = notification.notification_metadata;
  const tag = meta.tag;

  if (CHANNEL_EVENT_TYPES.includes(tag as any)) {
    return { type: 'channel', id: notification.entity_id };
  }

  switch (tag) {
    case 'ai_response':
      return { type: 'chat', id: notification.entity_id };
    case 'new_email':
      if (meta.tag === 'new_email') {
        return { type: 'email', id: meta.content.threadId };
      }
      return null;
    case 'channel_invite':
      return { type: 'channel', id: notification.entity_id };
    case 'document_mention':
    case 'mentioned_in_document_comment':
    case 'replied_to_document_comment_thread':
    case 'commented_on_document':
      if ('content' in meta && 'fileType' in meta.content) {
        const blockType = fileTypeToBlockName(meta.content.fileType);
        if (blockType && blockType !== 'csv') {
          return { type: blockType as BlockName, id: notification.entity_id };
        }
      }
      return null;
    case 'task_assigned':
      if (meta.tag === 'task_assigned') {
        return { type: 'task' as BlockName, id: meta.content.taskId };
      }
      return null;
    default:
      return null;
  }
}

function NotificationPreviewPanel(props: { notification: UnifiedNotification }) {
  const orchestrator = useGlobalBlockOrchestrator();
  const panel = useSplitPanelOrThrow();

  const blockInfo = createMemo(() => resolveNotificationBlock(props.notification));

  const blockInstance = createMemo(() => {
    const info = blockInfo();
    if (!info) return null;

    const { params } = getChannelNotificationParams(props.notification);
    return orchestrator.createBlockInstance(info.type, info.id, { params });
  });

  let toolbarLeftRef: HTMLDivElement | undefined;
  let toolbarRightRef: HTMLDivElement | undefined;

  return (
    <div class="flex flex-col size-full">
      <Show
        when={blockInstance()}
        fallback={
          <div class="flex items-center justify-center h-full text-ink-muted text-sm">
            Preview not available
          </div>
        }
      >
        {(instance) => (
          <>
            <div class="flex items-center justify-between shrink-0 h-10 bg-panel px-2 border-b border-edge-muted/50">
              <div class="flex h-full items-center" ref={toolbarLeftRef} />
              <div class="flex h-full items-center" ref={toolbarRightRef} />
            </div>
            <div class="flex-1 min-h-0">
              <SplitPanelContext.Provider
                value={{
                  ...panel,
                  layoutRefs: {
                    ...panel.layoutRefs,
                    headerLeft: undefined,
                    headerRight: undefined,
                    toolbarLeft: toolbarLeftRef,
                    toolbarRight: toolbarRightRef,
                  },
                  halfSplitState: undefined,
                }}
              >
                <Suspense fallback={<LoadingBlock />}>
                  <Dynamic component={instance().element} />
                </Suspense>
              </SplitPanelContext.Provider>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}

export function NotificationsView() {
  const panel = useSplitPanelOrThrow();
  const notificationSource = useGlobalNotificationSource();
  const isLoading = () => notificationSource.isLoading();

  const [highlightedStackId, setHighlightedStackId] = createSignal<
    string | null
  >(null);
  const [checkedIds, setCheckedIds] = createSignal<Set<string>>(new Set());

  createEffect(() => {
    panel.handle.setDisplayName('Notifications');
  });

  const notifications = () => notificationSource.notifications();
  const activeNotifications = createMemo(() =>
    notifications().filter((n) => !n.done)
  );

  const stacks = createMemo(() => stackNotifications(activeNotifications()));

  const getStackId = (stack: NotificationStack) =>
    getMostRecentNotification(stack).id;

  const highlightedStack = createMemo(() =>
    stacks().find((s) => getStackId(s) === highlightedStackId())
  );

  const highlightedNotification = createMemo(() => {
    const stack = highlightedStack();
    return stack ? getMostRecentNotification(stack) : undefined;
  });

  return (
    <div class="h-full flex flex-col">
      <SplitHeaderLeft>
        <h1 class="font-semibold text-ink select-none text-sm shrink-0">
          Notifications
        </h1>
      </SplitHeaderLeft>
      <div class="flex-1 flex min-h-0">
        <div class="w-[40%] min-w-72 max-w-[28rem] border-r border-edge-muted">
          <Show
            when={!isLoading()}
            fallback={
              <div class="p-4">
                <LoadingBlock />
              </div>
            }
          >
            <Show
              when={stacks().length > 0}
              fallback={
                <div class="flex items-center justify-center h-full text-ink-muted text-sm">
                  No notifications
                </div>
              }
            >
              <VList data={stacks()} class="py-2">
                {(stack) => {
                  const stackId = getStackId(stack);
                  return (
                    <NotificationRow
                      stack={stack}
                      highlighted={highlightedStackId() === stackId}
                      checked={checkedIds().has(stackId)}
                      onChecked={(checked) => {
                        setCheckedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) {
                            next.add(stackId);
                          } else {
                            next.delete(stackId);
                          }
                          return next;
                        });
                      }}
                      onMouseEnter={() => setHighlightedStackId(stackId)}
                    />
                  );
                }}
              </VList>
            </Show>
          </Show>
        </div>
        <div class="flex-1 min-w-0">
          <Show
            when={highlightedNotification()}
            fallback={
              <div class="flex items-center justify-center h-full text-ink-muted text-sm">
                Hover over a notification to preview
              </div>
            }
          >
            {(notification) => (
              <NotificationPreviewPanel notification={notification()} />
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
