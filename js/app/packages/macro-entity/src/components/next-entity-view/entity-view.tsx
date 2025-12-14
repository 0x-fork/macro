import type { Property } from '@core/component/Properties/types';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { TOKENS } from '@core/hotkey/tokens';
import CheckIcon from '@icon/regular/check.svg';
import {
  type ChannelContentHitData,
  type ContentHitData,
  type EntityClickHandler,
  type EntityData,
  isSearchEntity,
  isTaskEntity,
  type Notification,
  type SearchLocation,
  type WithNotification,
  type WithSearch,
} from '@macro-entity';
import { tryToTypedNotification } from '@notifications';
import { useUserId } from '@service-gql/client';
import { syncServiceClient } from '@service-sync/client';
import { createDraggable, createDroppable } from '@thisbeyond/solid-dnd';
import { getIconConfig } from 'core/component/EntityIcon';
import { StaticMarkdown } from 'core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from 'core/component/LexicalMarkdown/theme';
import { UserIcon } from 'core/component/UserIcon';
import { useDisplayName } from 'core/user';
import type { ParentProps, VoidProps } from 'solid-js';
import {
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { isProjectContainedEntity } from '../../queries/project';
import type { EntityClickEvent } from '../Entity';
import { PropertyPills } from '../PropertyPills';
import { UnifiedListItem } from '../unified-list-item';
import { EntityTitle } from './entity-title';
import { ProjectEntityDetails } from './project-entity-details';
import {
  DirectMessageIcon,
  SharedBadge,
  ThreadBorder,
  toFormattedDate,
  UnreadIndicator,
} from './utils';

type SomeEntity = WithNotification<EntityData | WithSearch<EntityData>>;

type NotificationClickHandler<T extends EntityData = EntityData> =
  EntityClickHandler<T & { notification: Notification }>;

interface EntityWithEverythingProps {
  entity: SomeEntity;
  focused?: boolean;
  timestamp?: number;
  onClick?: EntityClickHandler<SomeEntity>;
  onDonePress?: (entity: SomeEntity) => void;
  onClickNotification?: NotificationClickHandler<SomeEntity>;
  onMouseOver?: () => void;
  onMouseLeave?: () => void;
  onFocusIn?: () => void;
  onContextMenu?: () => void;
  properties?: Property[];
  contentPlacement?: 'middle' | 'bottom-row';
  unreadIndicatorActive?: boolean;
  fadeIfRead?: boolean;
  importantIndicatorActive?: boolean;
  showLeftColumnIndicator?: boolean;
  showUnrollNotifications?: boolean;
  showDoneButton?: boolean;
  highlighted?: boolean;
  selected?: boolean;
  onChecked?: (checked: boolean, shiftKey?: boolean) => void;
  checked?: boolean;
}

export function EntityWithEverything(
  props: VoidProps<EntityWithEverythingProps>
) {
  const getIcon = createMemo(() => {
    switch (props.entity.type) {
      case 'channel':
        switch (props.entity.channelType) {
          case 'direct_message':
            return getIconConfig('directMessage');
          case 'organization':
            return getIconConfig('company');
          default:
            return getIconConfig('channel');
        }
      case 'document':
        if (isTaskEntity(props.entity)) return getIconConfig('task');
        if (props.entity.fileType) return getIconConfig(props.entity.fileType);
        return getIconConfig('default');
      case 'chat':
        return getIconConfig('chat');
      case 'project':
        return getIconConfig('project');
      case 'email':
        return getIconConfig(props.entity.isRead ? 'emailRead' : 'email');
    }
  });

  const hasNotifications = () =>
    !!props.entity.notifications && props.entity.notifications().length > 0;

  const notDoneNotifications = () => {
    const notifications = props.entity.notifications?.();
    if (!notifications) return [];
    return notifications.filter(({ done }) => !done);
  };

  const contentHitData = () => {
    if (!isSearchEntity(props.entity)) return [];
    return props.entity.search.contentHitData ?? [];
  };

  onMount(() => {
    if (props.entity.type === 'document' && props.entity.fileType === 'md') {
      syncServiceClient.safeWakeup(props.entity.id);
      onCleanup(() => {
        syncServiceClient.cancelWakeup(props.entity.id);
      });
    }
  });

  const draggable = createDraggable(props.entity.id, props.entity);
  false && draggable;
  const droppable = createDroppable(props.entity.id, props.entity);
  false && droppable;

  const userId = useUserId();
  const sharedData = () => {
    if (props.entity.type === 'channel') {
      return false;
    }

    if (props.entity.ownerId === userId()) {
      return false;
    }
    return {
      ownerDisplayName: useDisplayName(props.entity.ownerId)[0],
      ownerId: props.entity.ownerId,
    };
  };

  /**
   * Properties for this entity
   * TODO - @danielkweon: Once endpoint includes properties, remove temp data and use: props.displayProperties ?? []
   */
  const properties = (): Property[] => {
    // Use real properties if provided, otherwise use temp data for testing
    return props.properties ?? [];
  };

  return (
    <UnifiedListItem
      use:draggable
      use:droppable
      focused={props.selected}
      checked={props.checked}
      highlighted={props.highlighted}
      onChecked={props.onChecked}
      onClick={(e) => props.onClick?.(props.entity, e)}
      contentPlacement={props.contentPlacement}
      onMouseOver={props.onMouseOver}
      onContextMenu={props.onContextMenu}
    >
      <UnifiedListItem.Content data-entity data-entity-id={props.entity.id}>
        <UnifiedListItem.Checkbox>
          <Show when={props.showLeftColumnIndicator && !props.checked}>
            <div class="absolute inset-0 flex items-center justify-center -z-1">
              <UnreadIndicator active={props.unreadIndicatorActive} />
            </div>
          </Show>
        </UnifiedListItem.Checkbox>
        {/* Left Column Indicator(s) */}
        {/* Icon and name - top left on mobile, first item on desktop */}
        <UnifiedListItem.MainContent
          classList={{
            'opacity-70': props.fadeIfRead && !props.unreadIndicatorActive,
          }}
        >
          <div class="flex size-5 shrink-0 items-center justify-center">
            <Show
              when={
                props.entity.type === 'channel' &&
                props.entity.channelType === 'direct_message'
              }
              fallback={
                <Dynamic
                  component={getIcon().icon}
                  class={`flex size-full ${getIcon().foreground}`}
                />
              }
            >
              <DirectMessageIcon entity={props.entity} />
            </Show>
          </div>
          <EntityTitle
            entity={props.entity}
            showUnrollNotifications={props.showUnrollNotifications}
          />
        </UnifiedListItem.MainContent>
        {/* Date and user - top right on mobile, end on desktop  */}
        <UnifiedListItem.RightContent
          classList={{
            'opacity-50': props.fadeIfRead && !props.unreadIndicatorActive,
          }}
        >
          <div class="flex flex-row items-center justify-end gap-2 min-w-0">
            <Show when={properties().length > 0}>
              <div class="pr-2 overflow-hidden shrink min-w-0">
                <PropertyPills properties={properties()} />
              </div>
            </Show>
            <Show when={sharedData()}>
              {(shared) => (
                <Tooltip
                  tooltip={`${shared().ownerDisplayName()} shared with you`}
                >
                  <SharedBadge ownerId={shared().ownerId} />
                </Tooltip>
              )}
            </Show>
            <Show when={isProjectContainedEntity(props.entity) && props.entity}>
              {(entity) => (
                <ProjectEntityDetails
                  entity={entity()}
                  onClick={props.onClick}
                />
              )}
            </Show>
            <Show when={props.timestamp ?? props.entity.updatedAt}>
              {(date) => (
                <span class="shrink-0 whitespace-nowrap text-xs font-mono uppercase text-ink-extra-muted">
                  {toFormattedDate(date())}
                </span>
              )}
            </Show>
            <Show when={props.highlighted && props.onDonePress}>
              <div class="absolute top-1 right-1 items-center flex">
                <Tooltip
                  tooltip={
                    <LabelAndHotKey
                      label="Mark as done"
                      hotkeyToken={TOKENS.entity.action.markDone}
                    />
                  }
                >
                  <button
                    type="button"
                    class="bg-panel flex items-center justify-center size-8 border border-edge-muted hover:bg-accent hover:text-panel"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onDonePress?.(props.entity);
                    }}
                    data-blocks-navigation
                  >
                    <CheckIcon class="w-4 h-4 pointer-events-none" />
                  </button>
                </Tooltip>
              </div>
            </Show>
          </div>
        </UnifiedListItem.RightContent>
        {/* Content Hits from Search */}
        <Show when={contentHitData().length > 0}>
          <div class="relative row-2 col-2 col-end-4 pb-2">
            <CollapsibleList items={contentHitData()} threadBorder>
              {(data, index, count) => (
                <ContentHitRow
                  data={data}
                  onClick={(e, location) => {
                    props.onClick?.(props.entity, e, location);
                  }}
                  index={index}
                  count={count}
                />
              )}
            </CollapsibleList>
          </div>
        </Show>
        {/* Notifications */}
        <Show
          when={
            props.showUnrollNotifications &&
            hasNotifications() &&
            contentHitData().length === 0
          }
        >
          <div class="relative col-2 col-end-4 pb-2">
            <CollapsibleList items={notDoneNotifications()} threadBorder>
              {(notification) => (
                <NotificationRow
                  notification={notification}
                  onClick={props.onClickNotification}
                  entity={props.entity}
                />
              )}
            </CollapsibleList>
          </div>
        </Show>
      </UnifiedListItem.Content>
    </UnifiedListItem>
  );
}

function CollapsibleListRow(
  props: ParentProps<{
    onClick?: (e: EntityClickEvent) => void;
    classList?: Record<string, boolean>;
    enableHover?: boolean;
    showThreadBorder?: boolean;
    blockNavigation?: boolean;
  }>
) {
  return (
    <div
      class="relative flex gap-1 items-center min-w-0 h-8 transition-all"
      classList={{
        'hover:bg-hover/50 hover:opacity-85':
          props.enableHover ?? !!props.onClick,
        ...props.classList,
      }}
      onClick={(e) => {
        if (props.onClick) {
          if (props.blockNavigation) {
            e.stopPropagation();
          }
          props.onClick(e);
        }
      }}
      data-blocks-navigation={props.blockNavigation}
    >
      <Show when={props.showThreadBorder}>
        <ThreadBorder />
      </Show>
      {props.children}
    </div>
  );
}

function CollapsibleList<T>(props: {
  items: T[];
  visibleCount?: number;
  children: (item: T, index?: number, count?: number) => any;
  threadBorder?: boolean;
}) {
  const [showAll, setShowAll] = createSignal(false);
  const visibleCount = () => props.visibleCount ?? 3;

  const visibleItems = () => {
    if (props.items.length <= visibleCount() || showAll()) {
      return props.items;
    }
    return props.items.slice(0, visibleCount());
  };

  const count = () => props.items.length;
  const hasMore = () => props.items.length > visibleCount();

  return (
    <>
      <For each={visibleItems()}>
        {(child, index) => props.children(child, index(), count())}
      </For>
      <Show when={hasMore()}>
        <div class="h-5">
          <Show when={props.threadBorder}>
            <ThreadBorder />
          </Show>
          <button
            class="block w-fit px-2 py-0.5 text-[10px] border border-edge uppercase font-mono hover:font-medium"
            onClick={(e) => {
              e.stopPropagation();
              setShowAll((prev) => !prev);
            }}
            data-blocks-navigation
          >
            <Show when={!showAll()} fallback={<>Collapse</>}>
              + {props.items.length - visibleCount()} More
            </Show>
          </button>
        </div>
      </Show>
    </>
  );
}

function NotificationRow(props: {
  notification: Notification;
  onClick?: NotificationClickHandler;
  entity: EntityData;
}) {
  const [userName] = useDisplayName(props.notification.senderId);

  const ActionContent = () => {
    if (
      props.notification.notificationEventType === 'document_mention' ||
      props.notification.notificationEventType === 'channel_message_document'
    ) {
      return 'shared';
    }

    const metadata = tryToTypedNotification(
      props.notification
    )?.notificationMetadata;
    if (!metadata || !('messageContent' in metadata)) return '';

    return 'message';
  };

  const MessageContent = () => {
    if (
      props.notification.notificationEventType === 'document_mention' ||
      props.notification.notificationEventType === 'channel_message_document'
    ) {
      return '';
    }

    const metadata = tryToTypedNotification(
      props.notification
    )?.notificationMetadata;
    if (
      !metadata ||
      !('messageContent' in metadata) ||
      metadata.messageContent === undefined
    )
      return '';

    return (
      <Show
        when={metadata.messageContent.trim()}
        fallback={<span class="italic text-ink-disabled">Attached items</span>}
      >
        {(content) => (
          <StaticMarkdown
            markdown={content()}
            theme={unifiedListMarkdownTheme}
            singleLine={true}
          />
        )}
      </Show>
    );
  };

  return (
    <CollapsibleListRow
      showThreadBorder
      onClick={
        props.onClick
          ? (e) => {
              props.onClick?.(
                {
                  ...props.entity,
                  notification: props.notification,
                },
                e
              );
            }
          : undefined
      }
      classList={{
        'opacity-70': props.notification.viewedAt !== null,
      }}
    >
      <div class="flex size-5 shrink-0 items-center justify-center mr-1">
        <UserIcon id={props.notification.senderId!} size="xs" />
      </div>
      <div class="flex gap-1 text-sm w-full min-w-0 overflow-hidden items-baseline">
        <div class="text-sm w-[20cqw] shrink-0 truncate min-w-0">
          {userName()}{' '}
          <span class="opacity-70 uppercase font-mono text-[0.625rem] ml-2">
            {ActionContent()}
          </span>
        </div>
        <MessageContent />
      </div>
      <div class="shrink-0 font-mono text-xs uppercase text-ink-extra-muted ml-2">
        {toFormattedDate(props.notification.createdAt)}
      </div>
    </CollapsibleListRow>
  );
}

function ContentHitRow(props: {
  data: ContentHitData;
  onClick: (e: EntityClickEvent, location?: SearchLocation) => void;
  index?: number;
  count?: number;
}) {
  const match = (): [number, number] | undefined => {
    if (props.index !== undefined && props.count !== undefined)
      return [props.index, props.count];
  };

  return (
    <CollapsibleListRow
      blockNavigation
      onClick={(e) => props.onClick(e, props.data.location)}
      showThreadBorder={props.data.type === 'channel'}
    >
      <Show
        when={props.data.type === 'channel' && props.data}
        fallback={
          <div class="flex gap-2 items-center min-w-0 w-full">
            <div class="flex size-5 shrink-0 items-center justify-center">
              <div class="h-4/5 border-l border-b w-2 border-edge-muted -translate-y-2 translate-x-[calc(0.25em-1px)]"></div>
            </div>
            <Show when={match()}>
              {(match) => {
                return (
                  <span class="font-mono text-xs text-ink-disabled/50">
                    {match()[0] + 1}/{match()[1]}
                  </span>
                );
              }}
            </Show>
            <GenericContentHit data={props.data} />
          </div>
        }
      >
        {(data) => <ChannelMessageContentHit data={data()} />}
      </Show>
    </CollapsibleListRow>
  );
}

function GenericContentHit(props: { data: ContentHitData }) {
  return (
    <div class="text-sm text-ink-muted truncate flex items-center">
      <StaticMarkdown
        markdown={props.data.content}
        theme={unifiedListMarkdownTheme}
        singleLine={true}
      />
    </div>
  );
}

function ChannelMessageContentHit(props: { data: ChannelContentHitData }) {
  const [userName] = useDisplayName(props.data.senderId);

  return (
    <div class="flex gap-2 items-center min-w-0">
      <div class="flex size-5 shrink-0 items-center justify-center">
        <UserIcon id={props.data.senderId} size="xs" />
      </div>
      <div class="flex gap-2 text-sm w-full min-w-0 overflow-hidden items-baseline">
        <div class="text-sm shrink-0 truncate min-w-0 font-medium">
          {userName()}
        </div>
        <div class="shrink-0 font-mono text-xs uppercase text-ink-extra-muted">
          {toFormattedDate(props.data.sentAt)}
        </div>
        <div class="text-sm text-ink-muted truncate flex items-center flex-1 min-w-0">
          <StaticMarkdown
            markdown={props.data.content}
            theme={unifiedListMarkdownTheme}
            singleLine={true}
          />
        </div>
      </div>
    </div>
  );
}
