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
  useNotificationsForEntity,
} from '@notifications';
import type { UnifiedNotification } from '@notifications';
import { fileTypeToBlockName } from '@core/constant/allBlocks';
import { cn } from '@ui/utils/classname';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
  Suspense,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import CaretDownIcon from '@icon/regular/caret-down.svg';
import { VList } from 'virtua/solid';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import {
  type EntityData,
  ListLayoutProvider,
  StackedListEntity,
  type WithNotification,
} from '@entity';
import { useSoupItemsQuery, type SoupBody } from '@queries/soup/items';
import { unreadFilterFn } from '@entity/utils/filter';

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

function NotificationFilterBar(props: {
  filter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
}) {
  return (
    <div class="flex items-center justify-between px-4 py-2 border-b border-edge-muted/50">
      <div class="flex gap-1">
        <For each={FILTER_TABS}>
          {(tab) => (
            <button
              class={cn(
                'px-2 py-1 text-xs rounded-xs transition-colors',
                props.filter === tab.value
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-ink-muted hover:bg-hover/10'
              )}
              onClick={() => props.onFilterChange(tab.value)}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <DropdownMenu>
        <DropdownMenu.Trigger class="flex items-center gap-1 px-2 py-1 text-xs text-ink-muted hover:bg-hover/10 rounded-xs">
          {SORT_OPTIONS.find((o) => o.value === props.sort)?.label}
          <CaretDownIcon class="size-3" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content class="bg-panel border border-edge-muted rounded-sm shadow-lg py-1 min-w-32 z-50">
            <For each={SORT_OPTIONS}>
              {(option) => (
                <DropdownMenu.Item
                  class={cn(
                    'px-3 py-1.5 text-xs cursor-pointer outline-none',
                    props.sort === option.value
                      ? 'bg-accent/10 text-accent'
                      : 'text-ink-muted hover:bg-hover/10'
                  )}
                  onSelect={() => props.onSortChange(option.value)}
                >
                  {option.label}
                </DropdownMenu.Item>
              )}
            </For>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  );
}

export function NotificationsView() {
  const panel = useSplitPanelOrThrow();
  const notificationSource = useGlobalNotificationSource();

  const [hoveredEntityId, setHoveredEntityId] = createSignal<string | null>(
    null
  );
  const [highlightedEntityId, setHighlightedEntityId] = createSignal<
    string | null
  >(null);
  const [checkedIds, setCheckedIds] = createSignal<Set<string>>(new Set());
  const [filter, setFilter] = createSignal<FilterTab>('all');
  const [sort, setSort] = createSignal<SortOption>('newest');
  const [listRef, setListRef] = createSignal<HTMLElement | undefined>();

  createEffect(() => {
    panel.handle.setDisplayName('Notifications');
  });

  const queryBody = createMemo(
    (): SoupBody => ({
      channel_filters: { notification_filters: { done: false } },
      chat_filters: { notification_filters: { done: false } },
      project_filters: { notification_filters: { done: false } },
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

  const entities = createMemo((): WithNotification<EntityData>[] => {
    const data = itemsQuery.data ?? [];
    let result = data.map((e) =>
      'notifications' in e
        ? (e as WithNotification<EntityData>)
        : attachNotifications(e)
    );

    if (filter() === 'unread') {
      result = result.filter((e) => unreadFilterFn(e));
    } else if (filter() === 'read') {
      result = result.filter((e) => !unreadFilterFn(e));
    }

    if (sort() === 'oldest') {
      result = [...result].reverse();
    }

    return result;
  });

  const highlightedEntity = createMemo(() =>
    entities().find((e) => e.id === highlightedEntityId())
  );

  const highlightedNotification = createMemo(
    (): UnifiedNotification | undefined => {
      const entity = highlightedEntity();
      if (!entity?.notifications) return undefined;
      const notifs = entity.notifications();
      return notifs.length > 0 ? notifs[0] : undefined;
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
                when={entities().length > 0}
                fallback={
                  <div class="flex items-center justify-center h-full text-ink-muted text-sm">
                    No notifications
                  </div>
                }
              >
                <ListLayoutProvider ref={listRef}>
                  <div ref={setListRef} class="h-full">
                    <VList data={entities()} class="py-2 h-full">
                      {(entity) => (
                        <StackedListEntity
                          entity={entity}
                          highlighted={highlightedEntityId() === entity.id}
                          hovered={hoveredEntityId() === entity.id}
                          checked={checkedIds().has(entity.id)}
                          showUnrollNotifications
                          onChecked={(checked, shiftKey) => {
                            setCheckedIds((prev) => {
                              const next = new Set(prev);
                              if (checked) {
                                next.add(entity.id);
                              } else {
                                next.delete(entity.id);
                              }
                              return next;
                            });
                          }}
                          onMouseMove={() => {
                            setHoveredEntityId(entity.id);
                          }}
                          onClick={() => {
                            setHighlightedEntityId(entity.id);
                          }}
                        />
                      )}
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
