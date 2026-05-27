import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@app/component/GlobalAppState';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { SplitPanelContext } from '@app/component/split-layout/context';
import type { BlockName } from '@core/block';
import { LoadingBlock } from '@core/component/LoadingBlock';
import {
  CHANNEL_EVENT_TYPES,
  getChannelNotificationParams,
  notificationIsRead,
  useNotificationsForEntity,
} from '@notifications';
import type { UnifiedNotification } from '@notifications';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { EntityIcon } from '@core/component/EntityIcon';
import { cn } from '@ui/utils/classname';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import HashIcon from '@phosphor/hash.svg';
import UserIcon from '@phosphor/user.svg';
import ChatTeardropIcon from '@phosphor/chat-teardrop.svg';
import ListChecksIcon from '@phosphor/list-checks.svg';
import { VList } from 'virtua/solid';
import { TabGroup, Dropdown, Tooltip } from '@ui';
import {
  type EntityData,
  ListLayoutProvider,
  StackedListEntity,
  type WithNotification,
} from '@entity';
import { useSoupItemsQuery, type SoupBody } from '@queries/soup/items';
import { unreadFilterFn } from '@entity/utils/filter';
import { UnreadIndicator } from '@entity/components/UnreadIndicator';
import { MultiSelectCheckbox } from '@entity/components/MultiSelectCheckbox';
import { NotificationIcon } from '@entity/extractors-notification/notification-icon';
import { NotificationSenderIcon } from '@entity/extractors-notification/notification-sender-icon';
import { NotificationDescription } from '@entity/extractors-notification/notification-description';
import { NotificationTimestamp } from '@entity/extractors-notification/notification-timestamp';
import { NotificationContent } from '@entity/extractors-notification/notification-content';
import { DisplayName } from '@entity/components/DisplayName';

type FilterTab = 'all' | 'unread' | 'read';
type SortOption = 'newest' | 'oldest';

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
];

const MESSAGE_NOTIFICATION_TYPES = [
  'channel_message_send',
  'channel_message_reply',
  'channel_mention',
];

const TASK_NOTIFICATION_TYPES = ['task_assigned'];

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDateGroup(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const thisWeekStart = new Date(today.getTime() - today.getDay() * 86400000);
  const lastWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400000);

  const itemDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );

  if (itemDate.getTime() >= today.getTime()) return 'Today';
  if (itemDate.getTime() >= yesterday.getTime()) return 'Yesterday';
  if (itemDate.getTime() >= thisWeekStart.getTime()) return 'This Week';
  if (itemDate.getTime() >= lastWeekStart.getTime()) return 'Last Week';
  return 'Older';
}

const DOCUMENT_NOTIFICATION_TYPES = [
  'document_mention',
  'mentioned_in_document_comment',
  'replied_to_document_comment_thread',
  'commented_on_document',
];

function getDocumentName(
  notification: UnifiedNotification
): string | undefined {
  const m = notification.notification_metadata;
  if (
    m.tag === 'document_mention' ||
    m.tag === 'mentioned_in_document_comment' ||
    m.tag === 'replied_to_document_comment_thread' ||
    m.tag === 'commented_on_document'
  ) {
    return m.content.documentName;
  }
  return undefined;
}

function getDocumentFileType(
  notification: UnifiedNotification
): string | undefined {
  const m = notification.notification_metadata;
  if (m.tag === 'document_mention') {
    // Check subType first for tasks
    const subType = m.content.subType;
    if (subType && typeof subType === 'object' && 'type' in subType) {
      return subType.type;
    }
    return m.content.fileType ?? undefined;
  }
  if (
    m.tag === 'mentioned_in_document_comment' ||
    m.tag === 'replied_to_document_comment_thread' ||
    m.tag === 'commented_on_document'
  ) {
    return m.content.fileType ?? undefined;
  }
  return undefined;
}

function isDocumentMentionTask(notification: UnifiedNotification): boolean {
  const m = notification.notification_metadata;
  if (m.tag === 'document_mention') {
    const subType = m.content.subType;
    if (subType && typeof subType === 'object' && 'type' in subType) {
      return subType.type === 'task';
    }
  }
  return false;
}

function getChannelName(notification: UnifiedNotification): string | undefined {
  const m = notification.notification_metadata;
  if (
    m.tag === 'channel_mention' ||
    m.tag === 'channel_message_send' ||
    m.tag === 'channel_message_reply'
  ) {
    return m.content.channelName;
  }
  return undefined;
}

function getChannelType(
  notification: UnifiedNotification
):
  | 'public'
  | 'organization'
  | 'private'
  | 'directMessage'
  | 'team'
  | undefined {
  const m = notification.notification_metadata;
  if (
    m.tag === 'channel_mention' ||
    m.tag === 'channel_message_send' ||
    m.tag === 'channel_message_reply'
  ) {
    return m.content.channelType;
  }
  return undefined;
}

function getThreadId(notification: UnifiedNotification): string | undefined {
  const m = notification.notification_metadata;
  if (m.tag === 'channel_message_reply' || m.tag === 'channel_mention') {
    return m.content.threadId ?? undefined;
  }
  return undefined;
}

function notificationRowClass(props: {
  highlighted?: boolean;
  hovered?: boolean;
  checked?: boolean;
}) {
  return cn(
    'w-[calc(100%-0.5rem)] mx-1 relative group/row flex flex-col rounded min-h-10 cursor-pointer',
    {
      'bg-accent/8': props.checked,
      'ring ring-accent/16 ring-inset': props.checked && props.highlighted,
      'ring ring-edge bg-active/60 ring-inset':
        props.highlighted && !props.checked,
      'bg-active/40': props.hovered && !props.highlighted && !props.checked,
      'hover:bg-active/40 hover:ring hover:ring-edge hover:ring-inset':
        !props.checked && !props.highlighted && !props.hovered,
    }
  );
}

type MessageGroup = {
  id: string;
  channelId: string;
  threadId?: string;
  notifications: UnifiedNotification[];
  timestamp: number;
  uniqueSenderIds: string[];
  unreadCount: number;
  latestMessage: UnifiedNotification;
};

type NotificationItemBase =
  | { type: 'entity'; entity: WithNotification<EntityData>; timestamp: number }
  | { type: 'message'; notification: UnifiedNotification; timestamp: number }
  | { type: 'document'; notification: UnifiedNotification; timestamp: number }
  | { type: 'task'; notification: UnifiedNotification; timestamp: number }
  | { type: 'group'; group: MessageGroup; timestamp: number };

type NotificationItem =
  | NotificationItemBase
  | { type: 'date-header'; label: string; timestamp: number };

function getItemId(item: NotificationItem): string {
  if (item.type === 'entity') return item.entity.id;
  if (item.type === 'group') return `group-${item.group.id}`;
  if (item.type === 'document') return item.notification.id;
  if (item.type === 'task') return item.notification.id;
  if (item.type === 'date-header') return `header-${item.label}`;
  return item.notification.id;
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

function NotificationPreviewPanel(props: {
  notification: UnifiedNotification;
}) {
  const orchestrator = useGlobalBlockOrchestrator();
  const panel = useSplitPanelOrThrow();

  const blockInfo = createMemo(() =>
    resolveNotificationBlock(props.notification)
  );

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
            <div class="flex items-center justify-between shrink-0 h-10 bg-surface px-2 border-b border-edge-muted/50">
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

function MessageNotificationRow(props: {
  notification: UnifiedNotification;
  highlighted?: boolean;
  hovered?: boolean;
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  onMouseMove?: () => void;
  onClick?: () => void;
}) {
  const unread = () => !notificationIsRead(props.notification);
  const channelName = () => getChannelName(props.notification);
  const channelType = () => getChannelType(props.notification);
  const isDirectMessage = () => channelType() === 'directMessage';
  const showChannel = () => !isDirectMessage() && channelName();
  const isMention = () =>
    props.notification.notification_event_type === 'channel_mention';
  const isThreadReply = () =>
    props.notification.notification_event_type === 'channel_message_reply';
  const threadId = () => getThreadId(props.notification);
  const senderId = () => props.notification.sender_id;

  return (
    <div
      class={cn(
        notificationRowClass(props),
        (isMention() || isDirectMessage()) && 'py-0.5'
      )}
      onClick={props.onClick}
      onMouseMove={props.onMouseMove}
      role="button"
      tabIndex={0}
    >
      <div
        class="grid w-full text-sm py-2 px-2"
        style={{
          'grid-template-columns': '1.5rem 1fr',
          gap: '0 0.75rem',
        }}
      >
        <div class="row-span-full flex justify-center relative group pt-1.5">
          <UnreadIndicator
            active={unread()}
            class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
          />
          <div
            class={cn(
              'absolute inset-0 flex justify-center pt-1.5',
              props.checked
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <MultiSelectCheckbox
              checked={props.checked}
              onChecked={props.onChecked}
            />
          </div>
        </div>
        <div
          class={cn('flex flex-col gap-0.5 min-w-0', {
            'opacity-80': !unread(),
          })}
        >
          <div class="flex items-center gap-1.5 min-w-0 w-full">
            <Show
              when={showChannel()}
              fallback={
                <Show when={isDirectMessage() && senderId()}>
                  <UserIcon class="size-3.5 shrink-0 text-ink-muted" />
                  <NotificationSenderIcon
                    notification={props.notification}
                    size="xs"
                  />
                  <span
                    class={cn('text-sm truncate', unread() && 'font-medium')}
                  >
                    <DisplayName id={senderId()!} />
                  </span>
                </Show>
              }
            >
              <HashIcon class="size-3.5 shrink-0 text-ink-muted" />
              <span class={cn('text-sm truncate', unread() && 'font-medium')}>
                {channelName()}
              </span>
            </Show>
            <Show when={isThreadReply() && threadId()}>
              <ChatTeardropIcon class="size-3 text-ink-extra-muted" />
              <span class="text-xs text-ink-extra-muted">thread</span>
            </Show>
            <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0 ml-auto">
              {getRelativeTime(new Date(props.notification.created_at))}
            </span>
          </div>
          <div class="flex items-center gap-1.5 min-w-0">
            <Show when={!isDirectMessage()}>
              <div class="shrink-0">
                <NotificationSenderIcon
                  notification={props.notification}
                  size="xs"
                />
              </div>
            </Show>
            <Show
              when={isMention()}
              fallback={
                <span class="text-sm text-ink-muted truncate">
                  <NotificationDescription notification={props.notification} />
                </span>
              }
            >
              <span class="ph-no-capture text-sm text-ink-muted truncate">
                <NotificationContent
                  notification={props.notification}
                  singleLine
                />
              </span>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentNotificationRow(props: {
  notification: UnifiedNotification;
  highlighted?: boolean;
  hovered?: boolean;
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  onMouseMove?: () => void;
  onClick?: () => void;
}) {
  const unread = () => !notificationIsRead(props.notification);
  const documentName = () => getDocumentName(props.notification) ?? 'Untitled';
  const fileType = () => getDocumentFileType(props.notification);
  const isTask = () => isDocumentMentionTask(props.notification);
  const targetType = () => (isTask() ? 'task' : fileTypeToBlockName(fileType()) ?? 'default');

  return (
    <div
      class={notificationRowClass(props)}
      onClick={props.onClick}
      onMouseMove={props.onMouseMove}
      role="button"
      tabIndex={0}
    >
      <div
        class="grid w-full text-sm py-2 px-2"
        style={{
          'grid-template-columns': '1.5rem 1fr',
          gap: '0 0.75rem',
        }}
      >
        <div class="row-span-full flex justify-center relative group pt-1.5">
          <UnreadIndicator
            active={unread()}
            class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
          />
          <div
            class={cn(
              'absolute inset-0 flex justify-center pt-1.5',
              props.checked
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <MultiSelectCheckbox
              checked={props.checked}
              onChecked={props.onChecked}
            />
          </div>
        </div>
        <div
          class={cn('flex flex-col gap-0.5 min-w-0', {
            'opacity-80': !unread(),
          })}
        >
          <div class="flex items-center gap-2 min-w-0 w-full">
            <div class="[&_svg]:size-4 shrink-0">
              <NotificationIcon
                notification={props.notification}
                class="size-4"
              />
            </div>
            <div class="shrink-0">
              <NotificationSenderIcon
                notification={props.notification}
                size="xs"
              />
            </div>
            <span
              class={cn(
                'ph-no-capture text-sm truncate min-w-0',
                unread() && 'font-medium'
              )}
            >
              <NotificationDescription notification={props.notification} />
            </span>
            <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0 ml-auto">
              <NotificationTimestamp notification={props.notification} />
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-sm text-ink-muted">
            <Show
              when={isTask()}
              fallback={<EntityIcon targetType={targetType()} size="xs" />}
            >
              <ListChecksIcon class="size-3.5 shrink-0" />
            </Show>
            <span class="truncate">{documentName()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTaskName(notification: UnifiedNotification): string | undefined {
  const m = notification.notification_metadata;
  if (m.tag === 'task_assigned') {
    return m.content.taskName ?? undefined;
  }
  return undefined;
}

function TaskNotificationRow(props: {
  notification: UnifiedNotification;
  highlighted?: boolean;
  hovered?: boolean;
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  onMouseMove?: () => void;
  onClick?: () => void;
}) {
  const unread = () => !notificationIsRead(props.notification);
  const taskName = () => getTaskName(props.notification) ?? 'Untitled Task';

  return (
    <div
      class={notificationRowClass(props)}
      onClick={props.onClick}
      onMouseMove={props.onMouseMove}
      role="button"
      tabIndex={0}
    >
      <div
        class="grid w-full text-sm py-2 px-2"
        style={{
          'grid-template-columns': '1.5rem 1fr',
          gap: '0 0.75rem',
        }}
      >
        <div class="row-span-full flex justify-center relative group pt-1.5">
          <UnreadIndicator
            active={unread()}
            class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
          />
          <div
            class={cn(
              'absolute inset-0 flex justify-center pt-1.5',
              props.checked
                ? 'opacity-100'
                : 'opacity-0 group-hover:opacity-100'
            )}
          >
            <MultiSelectCheckbox
              checked={props.checked}
              onChecked={props.onChecked}
            />
          </div>
        </div>
        <div
          class={cn('flex flex-col gap-0.5 min-w-0', {
            'opacity-80': !unread(),
          })}
        >
          <div class="flex items-center gap-2 min-w-0 w-full">
            <div class="[&_svg]:size-4 shrink-0">
              <NotificationIcon
                notification={props.notification}
                class="size-4"
              />
            </div>
            <div class="shrink-0">
              <NotificationSenderIcon
                notification={props.notification}
                size="xs"
              />
            </div>
            <span
              class={cn(
                'ph-no-capture text-sm truncate min-w-0',
                unread() && 'font-medium'
              )}
            >
              <NotificationDescription notification={props.notification} />
            </span>
            <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap shrink-0 ml-auto">
              {getRelativeTime(new Date(props.notification.created_at))}
            </span>
          </div>
          <div class="flex items-center gap-1.5 text-sm text-ink-muted">
            <ListChecksIcon class="size-3.5 shrink-0" />
            <span class="truncate">{taskName()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StackedAvatars(props: { senderIds: string[]; maxDisplay?: number }) {
  const displayIds = () => props.senderIds.slice(0, props.maxDisplay ?? 3);
  const overflow = () =>
    Math.max(0, props.senderIds.length - (props.maxDisplay ?? 3));

  return (
    <div class="flex items-center">
      <div class="flex -space-x-1.5">
        <For each={displayIds()}>
          {(senderId, index) => (
            <div
              class="relative rounded-full ring-1 ring-panel"
              style={{ 'z-index': displayIds().length - index() }}
            >
              <NotificationSenderIcon
                notification={{ sender_id: senderId } as UnifiedNotification}
                size="xs"
              />
            </div>
          )}
        </For>
      </div>
      <Show when={overflow() > 0}>
        <span class="text-[10px] text-ink-extra-muted ml-1">+{overflow()}</span>
      </Show>
    </div>
  );
}

function MessageNotificationGroup(props: {
  group: MessageGroup;
  highlighted?: boolean;
  hovered?: boolean;
  checked?: boolean;
  onChecked?: (checked: boolean, shiftKey: boolean) => void;
  onMouseMove?: () => void;
  onClick?: () => void;
}) {
  const [expanded, setExpanded] = createSignal(false);

  const notifications = () => props.group.notifications;
  const mostRecent = () => props.group.latestMessage;
  const hasUnread = () => props.group.unreadCount > 0;
  const channelName = () => getChannelName(mostRecent());
  const channelType = () => getChannelType(mostRecent());
  const isDirectMessage = () => channelType() === 'directMessage';
  const showChannel = () => !isDirectMessage() && channelName();
  const isThread = () => !!props.group.threadId;
  const uniqueSenders = () => props.group.uniqueSenderIds;

  const toggleExpand = (e: MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded());
  };

  return (
    <div class="flex flex-col">
      <div
        class={notificationRowClass(props)}
        onClick={props.onClick}
        onMouseMove={props.onMouseMove}
        role="button"
        tabIndex={0}
      >
        <div
          class={cn(
            'absolute h-full w-[3px] left-0 top-0 bg-accent rounded-r-full',
            props.highlighted ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div
          class="grid w-full text-sm py-2 px-2"
          style={{
            'grid-template-columns': '1.5rem 1fr',
            gap: '0 0.75rem',
          }}
        >
          <div class="row-span-full flex justify-center relative group pt-1.5">
            <UnreadIndicator
              active={hasUnread()}
              class={cn(props.checked && 'opacity-0', 'group-hover:opacity-0')}
            />
            <div
              class={cn(
                'absolute inset-0 flex justify-center pt-1.5',
                props.checked
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              )}
            >
              <MultiSelectCheckbox
                checked={props.checked}
                onChecked={props.onChecked}
              />
            </div>
          </div>
          <div
            class={cn('flex flex-col gap-1 min-w-0', {
              'opacity-80': !hasUnread(),
            })}
          >
            <div class="flex items-center gap-1.5 min-w-0 w-full">
              <button
                class="shrink-0 p-0.5 -ml-0.5 hover:bg-ink/10 rounded transition-colors"
                onClick={toggleExpand}
              >
                <Dynamic
                  component={expanded() ? CaretDownIcon : CaretRightIcon}
                  class="size-3 text-ink-muted"
                />
              </button>
              <Show
                when={showChannel()}
                fallback={
                  <Show when={isDirectMessage()}>
                    <UserIcon class="size-3.5 shrink-0 text-ink-muted" />
                    <StackedAvatars
                      senderIds={uniqueSenders()}
                      maxDisplay={2}
                    />
                  </Show>
                }
              >
                <HashIcon class="size-3.5 shrink-0 text-ink-muted" />
                <span
                  class={cn('text-sm truncate', hasUnread() && 'font-medium')}
                >
                  {channelName()}
                </span>
              </Show>
              <Show when={isThread()}>
                <ChatTeardropIcon class="size-3 text-ink-extra-muted" />
                <span class="text-xs text-ink-extra-muted">thread</span>
              </Show>
              <div class="flex items-center gap-1.5 ml-auto shrink-0">
                <Show when={hasUnread()}>
                  <span class="text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full font-medium">
                    {props.group.unreadCount} unread
                  </span>
                </Show>
                <span class="text-xs text-ink-extra-muted">
                  {notifications().length} msgs
                </span>
                <span class="text-xs text-ink-extra-muted font-light whitespace-nowrap">
                  {getRelativeTime(new Date(mostRecent().created_at))}
                </span>
              </div>
            </div>
            <Show when={!isDirectMessage()}>
              <div class="flex items-center gap-1.5">
                <StackedAvatars senderIds={uniqueSenders()} />
              </div>
            </Show>
            <div class="flex items-center gap-1.5 text-xs text-ink-muted truncate">
              <span class="ph-no-capture truncate">
                <NotificationContent notification={mostRecent()} singleLine />
              </span>
            </div>
          </div>
        </div>
      </div>
      <Show when={expanded()}>
        <div class="ml-8 border-l border-edge-muted/50 pl-2 py-1">
          <For each={notifications()}>
            {(notification) => (
              <div
                class="flex items-start gap-2 py-1.5 px-2 hover:bg-ink/5 rounded-xs cursor-pointer"
                onClick={props.onClick}
              >
                <div class="shrink-0 pt-0.5">
                  <UnreadIndicator active={!notificationIsRead(notification)} />
                </div>
                <div class="shrink-0">
                  <NotificationSenderIcon
                    notification={notification}
                    size="xs"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-medium">
                      <DisplayName id={notification.sender_id!} />
                    </span>
                    <span class="text-[10px] text-ink-extra-muted">
                      {getRelativeTime(new Date(notification.created_at))}
                    </span>
                  </div>
                  <div class="text-xs text-ink-muted truncate ph-no-capture">
                    <NotificationContent
                      notification={notification}
                      singleLine
                    />
                  </div>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function NotificationFilterBar(props: {
  filter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}) {
  const sortLabel = () =>
    SORT_OPTIONS.find((o) => o.value === props.sort)?.label;

  return (
    <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-edge-muted/50">
      <TabGroup
        items={FILTER_TABS}
        value={props.filter}
        onChange={(value) => props.onFilterChange(value as FilterTab)}
      />
      <Dropdown placement="bottom-end">
        <Tooltip label="Sort">
          <Dropdown.Trigger
            depth={2}
            class="whitespace-nowrap rounded-xs gap-1 [&_svg]:size-3 py-1.5 bg-surface text-xs text-ink-muted"
          >
            {sortLabel()}
            <CaretDownIcon />
          </Dropdown.Trigger>
        </Tooltip>
        <Dropdown.Content>
          <Dropdown.Group>
            <For each={SORT_OPTIONS}>
              {(option) => (
                <Dropdown.Item
                  onSelect={() => props.onSortChange(option.value)}
                >
                  <span
                    class="flex-1 truncate"
                    classList={{
                      'text-ink font-medium': props.sort === option.value,
                      'text-ink-muted': props.sort !== option.value,
                    }}
                  >
                    {option.label}
                  </span>
                  <span class="size-3.5 flex items-center justify-center shrink-0">
                    <Show when={props.sort === option.value}>
                      <CheckIcon class="size-3 text-accent" />
                    </Show>
                  </span>
                </Dropdown.Item>
              )}
            </For>
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown>
    </div>
  );
}

export function NotificationsView() {
  const panel = useSplitPanelOrThrow();
  const notificationSource = useGlobalNotificationSource();

  const [hoveredId, setHoveredId] = createSignal<string | null>(null);
  const [highlightedId, setHighlightedId] = createSignal<string | null>(null);
  const [checkedIds, setCheckedIds] = createSignal<Set<string>>(new Set());
  const [filter, setFilter] = createSignal<FilterTab>('all');
  const [sort, setSort] = createSignal<SortOption>('newest');
  const [listRef, setListRef] = createSignal<HTMLElement | undefined>();

  createEffect(() => {
    panel.handle.setDisplayName('Notifications');
  });

  // Query for entities (emails, documents with notifications, calls, etc.)
  const queryBody = createMemo(
    (): SoupBody => ({
      chat_filters: { notification_filters: { done: false } },
      project_filters: { notification_filters: { done: false } },
      document_filters: { notification_filters: { done: false } },
      call_filters: {},
      email_filters: { importance: true },
    })
  );

  const itemsQuery = useSoupItemsQuery(
    () => ({
      params: {
        limit: 100,
        sort_method: sort() === 'newest' ? 'updated_at' : 'created_at',
      },
      body: queryBody(),
    }),
    () => ({ enabled: true })
  );

  const attachNotifications = (
    entity: EntityData
  ): WithNotification<EntityData> => ({
    ...entity,
    notifications: useNotificationsForEntity(notificationSource, entity),
  });

  // Get message notifications separately
  const messageNotifications = createMemo(() => {
    return notificationSource
      .notifications()
      .filter(
        (n) =>
          !n.done &&
          MESSAGE_NOTIFICATION_TYPES.includes(n.notification_event_type)
      );
  });

  // Get document notifications separately
  const documentNotifications = createMemo(() => {
    return notificationSource
      .notifications()
      .filter(
        (n) =>
          !n.done &&
          DOCUMENT_NOTIFICATION_TYPES.includes(n.notification_event_type)
      );
  });

  // Get task notifications separately
  const taskNotifications = createMemo(() => {
    return notificationSource
      .notifications()
      .filter(
        (n) =>
          !n.done && TASK_NOTIFICATION_TYPES.includes(n.notification_event_type)
      );
  });

  // Build combined list of entities and message notifications (grouped by consecutive channel)
  const items = createMemo((): NotificationItem[] => {
    const entityData = itemsQuery.data ?? [];
    // Filter out documents - they're handled separately via documentNotifications
    const nonDocumentEntities = entityData.filter((e) => e.type !== 'document');
    const entities = nonDocumentEntities.map((e) =>
      'notifications' in e
        ? (e as WithNotification<EntityData>)
        : attachNotifications(e)
    );

    const entityItems: NotificationItemBase[] = entities.map((entity) => ({
      type: 'entity' as const,
      entity,
      timestamp: new Date(
        entity.updatedAt || entity.createdAt || Date.now()
      ).getTime(),
    }));

    // Sort messages by timestamp first
    const messages = [...messageNotifications()].sort((a, b) =>
      sort() === 'newest'
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Group messages by channel + thread within time window (but keep mentions separate)
    const TIME_WINDOW_MS = 60 * 60 * 1000; // 1 hour
    const messageItems: NotificationItemBase[] = [];

    const getGroupKey = (n: UnifiedNotification) => {
      const threadId = getThreadId(n);
      return threadId ? `${n.entity_id}:${threadId}` : n.entity_id;
    };

    // First pass: collect all non-mention messages by group key
    const groupedByKey = new Map<string, UnifiedNotification[]>();
    const mentionItems: NotificationItemBase[] = [];

    for (const n of messages) {
      const isMention = n.notification_event_type === 'channel_mention';
      if (isMention) {
        mentionItems.push({
          type: 'message' as const,
          notification: n,
          timestamp: new Date(n.created_at).getTime(),
        });
      } else {
        const groupKey = getGroupKey(n);
        if (!groupedByKey.has(groupKey)) {
          groupedByKey.set(groupKey, []);
        }
        groupedByKey.get(groupKey)!.push(n);
      }
    }

    // Second pass: split groups by time window and create items
    for (const [groupKey, notifications] of groupedByKey) {
      // Sort by time (newest first for newest sort)
      const sorted = [...notifications].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Split into time-windowed subgroups
      const subgroups: UnifiedNotification[][] = [];
      let currentSubgroup: UnifiedNotification[] = [];
      let lastTimestamp: number | null = null;

      for (const n of sorted) {
        const ts = new Date(n.created_at).getTime();
        if (lastTimestamp === null || lastTimestamp - ts <= TIME_WINDOW_MS) {
          currentSubgroup.push(n);
        } else {
          if (currentSubgroup.length > 0) {
            subgroups.push(currentSubgroup);
          }
          currentSubgroup = [n];
        }
        lastTimestamp = ts;
      }
      if (currentSubgroup.length > 0) {
        subgroups.push(currentSubgroup);
      }

      // Create items for each subgroup
      for (const subgroup of subgroups) {
        if (subgroup.length === 1) {
          messageItems.push({
            type: 'message' as const,
            notification: subgroup[0],
            timestamp: new Date(subgroup[0].created_at).getTime(),
          });
        } else {
          const mostRecent = subgroup[0];
          const uniqueSenderIds = [
            ...new Set(subgroup.map((n) => n.sender_id).filter(Boolean)),
          ] as string[];
          const unreadCount = subgroup.filter(
            (n) => !notificationIsRead(n)
          ).length;

          messageItems.push({
            type: 'group' as const,
            group: {
              id: `${groupKey}-${mostRecent.created_at}`,
              channelId: mostRecent.entity_id,
              threadId: getThreadId(mostRecent),
              notifications: subgroup,
              timestamp: new Date(mostRecent.created_at).getTime(),
              uniqueSenderIds,
              unreadCount,
              latestMessage: mostRecent,
            },
            timestamp: new Date(mostRecent.created_at).getTime(),
          });
        }
      }
    }

    // Add mentions back
    messageItems.push(...mentionItems);

    // Add document notifications
    const documentItems: NotificationItemBase[] = documentNotifications().map(
      (n) => ({
        type: 'document' as const,
        notification: n,
        timestamp: new Date(n.created_at).getTime(),
      })
    );

    // Add task notifications
    const taskItems: NotificationItemBase[] = taskNotifications().map((n) => ({
      type: 'task' as const,
      notification: n,
      timestamp: new Date(n.created_at).getTime(),
    }));

    let combined: NotificationItemBase[] = [
      ...entityItems,
      ...messageItems,
      ...documentItems,
      ...taskItems,
    ];

    // Sort by timestamp
    combined.sort((a, b) =>
      sort() === 'newest'
        ? b.timestamp - a.timestamp
        : a.timestamp - b.timestamp
    );

    // Apply read/unread filter
    if (filter() === 'unread') {
      combined = combined.filter((item) => {
        if (item.type === 'entity') {
          return unreadFilterFn(item.entity);
        }
        if (item.type === 'group') {
          return item.group.notifications.some((n) => !notificationIsRead(n));
        }
        if (item.type === 'message' || item.type === 'document') {
          return !notificationIsRead(item.notification);
        }
        return true;
      });
    } else if (filter() === 'read') {
      combined = combined.filter((item) => {
        if (item.type === 'entity') {
          return !unreadFilterFn(item.entity);
        }
        if (item.type === 'group') {
          return item.group.notifications.every((n) => notificationIsRead(n));
        }
        if (item.type === 'message' || item.type === 'document') {
          return notificationIsRead(item.notification);
        }
        return true;
      });
    }

    // Insert date headers
    const withHeaders: NotificationItem[] = [];
    let currentDateGroup: string | null = null;

    for (const item of combined) {
      const dateGroup = getDateGroup(item.timestamp);
      if (dateGroup !== currentDateGroup) {
        withHeaders.push({
          type: 'date-header' as const,
          label: dateGroup,
          timestamp: item.timestamp,
        });
        currentDateGroup = dateGroup;
      }
      withHeaders.push(item);
    }

    return withHeaders;
  });

  const highlightedItem = createMemo(() =>
    items().find((item) => getItemId(item) === highlightedId())
  );

  const highlightedNotification = createMemo(
    (): UnifiedNotification | undefined => {
      const item = highlightedItem();
      if (!item) return undefined;

      if (item.type === 'message') {
        return item.notification;
      }

      if (item.type === 'document') {
        return item.notification;
      }

      if (item.type === 'task') {
        return item.notification;
      }

      if (item.type === 'group') {
        return item.group.notifications[0];
      }

      if (item.type === 'entity') {
        const notifs = item.entity.notifications?.();
        return notifs && notifs.length > 0 ? notifs[0] : undefined;
      }

      return undefined;
    }
  );

  const isLoading = () => itemsQuery.isLoading;

  return (
    <div class="h-full flex flex-col">
      <SplitHeaderLeft>
        <h1 class="font-semibold text-ink select-none text-sm shrink-0">
          Notifications
        </h1>
      </SplitHeaderLeft>
      <div class="flex-1 flex min-h-0">
        <div class="w-[40%] min-w-72 max-w-[28rem] border-r border-edge-muted flex flex-col">
          <NotificationFilterBar
            filter={filter()}
            onFilterChange={setFilter}
            sort={sort()}
            onSortChange={setSort}
          />
          <div class="flex-1 min-h-0">
            <Show
              when={!isLoading()}
              fallback={
                <div class="p-4">
                  <LoadingBlock />
                </div>
              }
            >
              <Show
                when={items().length > 0}
                fallback={
                  <div class="flex items-center justify-center h-full text-ink-muted text-sm">
                    No notifications
                  </div>
                }
              >
                <ListLayoutProvider ref={listRef}>
                  <div
                    ref={setListRef}
                    class="h-full"
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <VList data={items()} class="py-2 h-full">
                      {(item) => {
                        const itemId = getItemId(item);
                        return (
                          <Switch>
                            <Match when={item.type === 'entity' && item}>
                              {(entityItem) => {
                                const isCall =
                                  entityItem().entity.type === 'call';
                                return (
                                  <StackedListEntity
                                    entity={entityItem().entity}
                                    highlighted={highlightedId() === itemId}
                                    hovered={
                                      isCall ? false : hoveredId() === itemId
                                    }
                                    checked={checkedIds().has(itemId)}
                                    onChecked={(checked, _shiftKey) => {
                                      setCheckedIds((prev) => {
                                        const next = new Set(prev);
                                        if (checked) {
                                          next.add(itemId);
                                        } else {
                                          next.delete(itemId);
                                        }
                                        return next;
                                      });
                                    }}
                                    onMouseMove={
                                      isCall
                                        ? undefined
                                        : () => setHoveredId(itemId)
                                    }
                                    onClick={() => setHighlightedId(itemId)}
                                  />
                                );
                              }}
                            </Match>
                            <Match when={item.type === 'message' && item}>
                              {(messageItem) => (
                                <MessageNotificationRow
                                  notification={messageItem().notification}
                                  highlighted={highlightedId() === itemId}
                                  hovered={hoveredId() === itemId}
                                  checked={checkedIds().has(itemId)}
                                  onChecked={(checked, _shiftKey) => {
                                    setCheckedIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) {
                                        next.add(itemId);
                                      } else {
                                        next.delete(itemId);
                                      }
                                      return next;
                                    });
                                  }}
                                  onMouseMove={() => setHoveredId(itemId)}
                                  onClick={() => setHighlightedId(itemId)}
                                />
                              )}
                            </Match>
                            <Match when={item.type === 'group' && item}>
                              {(groupItem) => (
                                <MessageNotificationGroup
                                  group={groupItem().group}
                                  highlighted={highlightedId() === itemId}
                                  hovered={hoveredId() === itemId}
                                  checked={checkedIds().has(itemId)}
                                  onChecked={(checked, _shiftKey) => {
                                    setCheckedIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) {
                                        next.add(itemId);
                                      } else {
                                        next.delete(itemId);
                                      }
                                      return next;
                                    });
                                  }}
                                  onMouseMove={() => setHoveredId(itemId)}
                                  onClick={() => setHighlightedId(itemId)}
                                />
                              )}
                            </Match>
                            <Match when={item.type === 'document' && item}>
                              {(docItem) => (
                                <DocumentNotificationRow
                                  notification={docItem().notification}
                                  highlighted={highlightedId() === itemId}
                                  hovered={hoveredId() === itemId}
                                  checked={checkedIds().has(itemId)}
                                  onChecked={(checked, _shiftKey) => {
                                    setCheckedIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) {
                                        next.add(itemId);
                                      } else {
                                        next.delete(itemId);
                                      }
                                      return next;
                                    });
                                  }}
                                  onMouseMove={() => setHoveredId(itemId)}
                                  onClick={() => setHighlightedId(itemId)}
                                />
                              )}
                            </Match>
                            <Match when={item.type === 'task' && item}>
                              {(taskItem) => (
                                <TaskNotificationRow
                                  notification={taskItem().notification}
                                  highlighted={highlightedId() === itemId}
                                  hovered={hoveredId() === itemId}
                                  checked={checkedIds().has(itemId)}
                                  onChecked={(checked, _shiftKey) => {
                                    setCheckedIds((prev) => {
                                      const next = new Set(prev);
                                      if (checked) {
                                        next.add(itemId);
                                      } else {
                                        next.delete(itemId);
                                      }
                                      return next;
                                    });
                                  }}
                                  onMouseMove={() => setHoveredId(itemId)}
                                  onClick={() => setHighlightedId(itemId)}
                                />
                              )}
                            </Match>
                            <Match when={item.type === 'date-header' && item}>
                              {(header) => (
                                <div class="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm px-4 py-2 border-b border-edge-muted">
                                  <span class="text-xs font-medium text-ink-muted uppercase tracking-wide">
                                    {header().label}
                                  </span>
                                </div>
                              )}
                            </Match>
                          </Switch>
                        );
                      }}
                    </VList>
                  </div>
                </ListLayoutProvider>
              </Show>
            </Show>
          </div>
        </div>
        <div class="flex-1 min-w-0">
          <Show
            when={highlightedNotification()}
            fallback={
              <div class="flex items-center justify-center h-full text-ink-muted text-sm">
                Click a notification to preview
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
