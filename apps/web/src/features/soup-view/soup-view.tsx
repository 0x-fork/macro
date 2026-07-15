import {
  createListState,
  List,
  type ListActivation,
  type ListItemState,
  type ListState,
  useList,
} from '@app/components/list';
import { LIST_VIEW_DOCS_URL } from '@app/constants/docs-links';
import type { ListView } from '@app/constants/list-views';
import { SoupChatInput } from '@app/features/chat/SoupChatInput';
import { runCreateAction } from '@app/features/command/Launcher';
import { registerDocumentsFilterSplit } from '@app/features/next-soup/soup-view/documents-filter-controllers';
import { GroupDropdown } from '@app/features/next-soup/soup-view/filters-bar/group-dropdown';
import { SortDropdown } from '@app/features/next-soup/soup-view/filters-bar/sort-dropdown';
import {
  COMPANY_GROUP_OPTIONS,
  type GroupOption,
  type GroupOptionId,
  TASK_GROUP_OPTIONS,
} from '@app/features/next-soup/soup-view/group-options';
import { registerSearchSplit } from '@app/features/next-soup/soup-view/search-controllers';
import {
  CHANNEL_SORT_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  EMAIL_SORT_OPTIONS,
  type SortOption,
  type SystemSortOption,
  TASK_SORT_OPTIONS,
} from '@app/features/next-soup/soup-view/sort-options';
import { SoupEntitySelectionToolbar } from '@app/features/next-soup/soup-view/soup-entity-selection-toolbar';
import { SoupViewCreateButton } from '@app/features/next-soup/soup-view/soup-view-create-button';
import {
  type TabbedListView,
  VIEW_TAB_LISTS,
} from '@app/features/next-soup/soup-view/soup-view-tabs';
import { CompanyListEntity } from '@app/features/next-soup/soup-view/views/companies/CompanyListEntity';
import { InboxListEntity } from '@app/features/next-soup/soup-view/views/inbox/InboxListEntity';
import { TaskListEntity } from '@app/features/next-soup/soup-view/views/tasks/TaskListEntity';
import {
  navigateChannelEntityToTarget,
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
  scopeChannelNotificationsForEntity,
} from '@app/features/next-soup/utils';
import {
  createSoupCollection,
  type FacetSelection,
  type SoupCollection,
  SoupCollectionProvider,
  type SoupItem,
  useSoupCollection,
} from '@app/features/soup-list';
import { NIL_UUID } from '@app/features/soup-list/facet-store';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { usePreference } from '@app/preferences/use-preference';
import type { CrmViewConfig } from '@companies/crm/saved-views';
import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@components/app/GlobalAppState';
import {
  type PullToRefreshState,
  usePullToRefresh,
} from '@components/app/mobile/use-pull-to-refresh';
import { PreviewPanel } from '@components/app/PreviewPanel';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import {
  SplitToolbarLeft,
  SplitToolbarRight,
} from '@components/app/split-layout/components/SplitToolbar';
import { SplitPanelContext } from '@components/app/split-layout/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { Resize } from '@core/component/Resize';
import { TabsInset } from '@core/component/TabsInset';
import {
  ENABLE_NEW_INBOX_FLAG,
  ENABLE_NEW_INBOX_OVERRIDE,
  ENABLE_UNIFIED_LIST_AI_INPUT,
} from '@core/constant/featureFlags';
import { useUserContext, useUserId } from '@core/context/user';
import { useAddInboxFlow, useEmailLinksStatus } from '@core/email-link';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { isMobile } from '@core/mobile/isMobile';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { openExternalUrl } from '@core/util/url';
import { useIsKeyPressActive } from '@core/util/useIsKeyPressActive';
import EmptyStateAiGraphic from '@design/empty-state-ai.svg';
import EmptyStateCallsGraphic from '@design/empty-state-calls.svg';
import EmptyStateChannelsGraphic from '@design/empty-state-channels.svg';
import EmptyStateCompaniesGraphic from '@design/empty-state-companies.svg';
import EmptyStateDocGraphic from '@design/empty-state-doc.svg';
import EmptyStatePreviewIcon from '@design/empty-state-doc.svg';
import EmptyStateEmailGraphic from '@design/empty-state-email.svg';
import EmptyStateFolderGraphic from '@design/empty-state-folder.svg';
import EmptyStateInboxGraphic from '@design/empty-state-inbox-tray.svg';
import EmptyStateNoSearchGraphic from '@design/empty-state-no-search-match.svg';
import EmptyStateTasksGraphic from '@design/empty-state-tasks.svg';
import {
  type EntityData,
  isSearchEntity,
  ListEntity,
  ListLayoutProvider,
  type ProjectEntity,
  type SearchLocation,
} from '@entity';
import { createEffectOnEntityTypeNotification } from '@notifications';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CaretRightIcon from '@phosphor/caret-right.svg';
import InfoIcon from '@phosphor/info.svg';
import PlusIcon from '@phosphor/plus.svg';
import Spinner from '@phosphor/spinner.svg';
import EyeIcon from '@phosphor-icons/core/regular/eye.svg?component-solid';
import EyeSlashIcon from '@phosphor-icons/core/regular/eye-slash.svg?component-solid';
import { useQueryClient } from '@queries/client';
import { emailKeys } from '@queries/email/keys';
import { invalidateEntityNotifications } from '@queries/notification/user-notifications';
import {
  invalidateSoupEntity,
  refetchSoupEntity,
} from '@queries/soup/normalized-cache';
import { useIsTeamAdmin } from '@queries/team/teams';
import { Button, EmptyStatePanel, Tooltip } from '@ui';
import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
  Suspense,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import type { VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';
import { SoupFacetFilter } from './filters/soup-facet-filter';
import {
  getViewPreset,
  type PresetContext,
  VIEW_TAB_PRESETS,
} from './soup-view-presets';
import { useSoupViewEntryState } from './use-soup-view-entry-state';
import { useSoupViewHotkeys } from './use-soup-view-hotkeys';

const WIDE_SPLIT_PANEL_BREAKPOINT = 640;
const DEFAULT_ITEM_SIZE = 10;
const DEFAULT_OVERSCAN = 5;
const COMPANY_MODE_TABS = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];
type SoupReadFilter = 'all' | 'unread' | 'read';

const INBOX_READ_TABS = [
  { value: 'unread', label: 'Unread' },
  { value: 'read', label: 'Read' },
  { value: 'all', label: 'All' },
];

export type SoupViewProps = {
  view: ListView;
  viewName: string;
  state?: ListState<SoupItem>;

  initialFacets?: FacetSelection;
  initialSearchText?: string;
  initialGroupBy?: string;
  disableLocalSearch?: boolean;
  additionalEntities?: Accessor<EntityData[]>;
  initialCrmView?: CrmViewConfig;

  loading?: JSX.Element;
  empty?: JSX.Element;
  error?: (error: unknown) => JSX.Element;
  forceEmpty?: boolean;
  itemSize?: number;
  overscan?: number;
  cache?: CacheSnapshot;
  initialScrollOffset?: number;
  nearEndOffset?: number;
  customScrollbarHidden?: boolean;

  scopeId?: string;
  isNewInbox?: boolean;
  initialPreviewOpen?: boolean;
  onActivate?: (activation: ListActivation<SoupItem>) => void;
  onNavigate?: (item: SoupItem, index: number) => void;
  canNavigate?: () => boolean;
  onLoadMoreError?: (error: unknown) => void;
  onRefreshError?: (error: unknown) => void;
  pullIndicator?: (state: PullToRefreshState) => JSX.Element;
};

type SoupActivationMetadata = {
  event?: MouseEvent | PointerEvent;
  location?: SearchLocation;
  project?: ProjectEntity;
  navigateChannelTarget?: boolean;
  openInNewSplit?: boolean;
};

const entityFromItem = (item: SoupItem | undefined): EntityData | undefined =>
  item?.kind === 'entity' ? item.entity : undefined;

const getReadFilter = (collection: SoupCollection): SoupReadFilter => {
  if (collection.facets.has('read-state', 'read')) return 'read';
  if (collection.facets.has('read-state', 'unread')) return 'unread';
  return 'all';
};

const setReadFilter = (collection: SoupCollection, value: SoupReadFilter) => {
  collection.facets.set('read-state', value === 'all' ? [] : [value]);
};

const useIsNewInbox = (
  view: () => ListView,
  override: () => boolean | undefined
) => {
  const flag = useFeatureFlag(ENABLE_NEW_INBOX_FLAG, {
    enabledOverride: ENABLE_NEW_INBOX_OVERRIDE,
  });
  return () => view() === 'inbox' && (override() ?? flag().enabled);
};

const useSoupNotificationInvalidators = () => {
  const notificationSource = useGlobalNotificationSource();
  const queryClient = useQueryClient();

  createEffectOnEntityTypeNotification(
    notificationSource,
    'channel',
    (notification) => {
      const metadata = notification.notification_metadata;
      const threadId =
        metadata.tag === 'channel_mention' ||
        metadata.tag === 'channel_message_reply'
          ? metadata.content.threadId?.toString()
          : undefined;

      refetchSoupEntity(notification.entity_id, 'channel');
      invalidateSoupEntity(notification.entity_id);
      invalidateEntityNotifications(notification.entity_id);

      if (threadId) {
        refetchSoupEntity(threadId, 'channelThread');
        invalidateSoupEntity(threadId);
        invalidateEntityNotifications(threadId);
      }
    }
  );

  for (const type of ['chat', 'foreign_entity'] as const) {
    createEffectOnEntityTypeNotification(
      notificationSource,
      type,
      (notification) => {
        refetchSoupEntity(
          notification.entity_id,
          type === 'chat' ? 'chat' : 'foreignEntity'
        );
        invalidateSoupEntity(notification.entity_id);
        invalidateEntityNotifications(notification.entity_id);
      }
    );
  }

  createEffectOnEntityTypeNotification(
    notificationSource,
    'email_thread',
    (notification) => {
      refetchSoupEntity(notification.entity_id, 'emailThread');
      invalidateSoupEntity(notification.entity_id);
      queryClient.invalidateQueries({
        queryKey: emailKeys.threadMessages(notification.entity_id).queryKey,
      });
    }
  );

  createEffectOnEntityTypeNotification(
    notificationSource,
    'document',
    (notification) => {
      if (notification.notification_event_type !== 'task_assigned') return;
      refetchSoupEntity(notification.entity_id, 'document');
      invalidateSoupEntity(notification.entity_id);
      invalidateEntityNotifications(notification.entity_id);
    }
  );
};

/** Concrete full-frame Soup list view. */
export function SoupView(props: SoupViewProps) {
  const userId = useUserId();
  const isNewInbox = useIsNewInbox(
    () => props.view,
    () => props.isNewInbox
  );
  const isTeamAdmin = useIsTeamAdmin();
  const [sortPreference, setSortPreference] = usePreference<string[]>(
    `macro:pref:soup:${props.view}:sort`,
    { default: [] }
  );
  const initialCrmView =
    props.view === 'companies' ? props.initialCrmView : undefined;
  const requestedInitialTab =
    initialCrmView?.activeTab ?? VIEW_TAB_PRESETS[props.view]?.default;
  const presetContext = (): PresetContext => ({
    userId: userId(),
    isTeamAdmin: isTeamAdmin(),
    isNewInbox: isNewInbox(),
  });
  const initialPreset =
    getViewPreset(props.view, requestedInitialTab, presetContext()) ??
    getViewPreset(props.view, undefined, presetContext());
  const initialTab =
    initialPreset?.initialFacets?.[props.view]?.[0] ?? requestedInitialTab;
  const initialFacets: FacetSelection = {
    ...(initialPreset?.initialFacets ?? {}),
    ...(props.initialFacets ?? {}),
    ...(initialCrmView?.facets ?? {}),
  };
  const presetViewSelection = initialPreset?.initialFacets?.[props.view];
  if (presetViewSelection) {
    initialFacets[props.view] = [...presetViewSelection];
  }
  if (initialCrmView?.ownerFilter?.length) {
    initialFacets['company-owner'] = [...initialCrmView.ownerFilter];
  }
  if (initialCrmView?.stageFilter?.length) {
    initialFacets['company-stage'] = [...initialCrmView.stageFilter];
  }
  initialFacets['channel-thread-scope'] = [
    isNewInbox() ? (userId() ?? NIL_UUID) : NIL_UUID,
  ];
  if (isNewInbox()) {
    initialFacets['read-state'] = ['unread'];
    initialFacets['call-status'] = ['MISSED'];
  }

  const collection = createSoupCollection({
    initialFacets,
    initialExtraFacets: initialPreset?.facets,
    initialSearch: initialCrmView?.searchText ?? props.initialSearchText,
    initialGroupBy: initialCrmView
      ? (initialCrmView.groupBy ?? undefined)
      : (props.initialGroupBy ?? initialPreset?.groupBy),
    initialSortIds:
      initialCrmView?.sort ??
      (sortPreference().length > 0 ? sortPreference() : undefined),
    initialActiveTab: initialTab,
    initialEmailView: initialPreset?.emailView,
    initialViewMode: initialCrmView?.viewMode ?? 'board',
    disableLocalSearch: () => props.disableLocalSearch ?? false,
    additionalEntities: props.additionalEntities,
    scopeNotifications: (entity, notifications) =>
      isNewInbox()
        ? scopeChannelNotificationsForEntity(entity, notifications)
        : notifications,
    isClientGroup: (field) =>
      props.view === 'companies' && field.type === 'property',
  });

  const syncViewFacets = () => {
    const preset = getViewPreset(
      props.view,
      collection.activeTab(),
      presetContext()
    );
    collection.facets.setExtraFacets(preset?.facets ?? []);
    collection.setEmailView(preset?.emailView);
    collection.facets.set('channel-thread-scope', [
      isNewInbox() ? (userId() ?? NIL_UUID) : NIL_UUID,
    ]);
    if (isNewInbox()) {
      collection.facets.set('call-status', ['MISSED']);
    }
  };
  createEffect(syncViewFacets);
  createEffect(
    on(() => collection.sort().map((sort) => sort.id), setSortPreference, {
      defer: true,
    })
  );

  const listState =
    props.state ??
    createListState<SoupItem>({
      isSelectable: (item) => item.kind === 'entity',
      suppressFocus: () => isTouchDevice(),
    });

  return (
    <SoupCollectionProvider value={collection}>
      <List.Root dataSource={collection.dataSource} state={listState}>
        <SoupViewContent {...props} />
      </List.Root>
    </SoupCollectionProvider>
  );
}

function SoupViewContent(props: SoupViewProps) {
  const panel = useSplitPanelOrThrow();
  const orchestrator = useGlobalBlockOrchestrator();
  const user = useUserContext();
  const isTeamAdmin = useIsTeamAdmin();
  const emailConnected = useEmailLinksStatus();
  const addInbox = useAddInboxFlow();
  const collection = useSoupCollection();
  const { dataSource, state: listState } = useList<SoupItem>();
  const initialCrmView =
    props.view === 'companies' ? props.initialCrmView : undefined;
  const isNewInbox = useIsNewInbox(
    () => props.view,
    () => props.isNewInbox
  );
  const readFilter = () => getReadFilter(collection);
  const updateReadFilter = (value: SoupReadFilter) =>
    setReadFilter(collection, value);
  const [attachHotkeys, listScopeId] = useHotkeyDOMScope('soup-view');

  const activateItem = (activation: ListActivation<SoupItem>) => {
    props.onActivate?.(activation);
    if (activation.item.kind !== 'entity') return;

    const metadata = (activation.metadata ?? {}) as SoupActivationMetadata;
    const entity = metadata.project ?? activation.item.entity;

    if (metadata.navigateChannelTarget) {
      void navigateChannelEntityToTarget(entity, orchestrator);
      return;
    }

    let location = metadata.location;
    if (!location && isSearchEntity(entity)) {
      const hits = entity.search.contentHitData;
      if (hits?.length === 1) location = hits[0]?.location;
    }

    if (metadata.event?.metaKey || metadata.event?.ctrlKey) {
      openEntityInNewTab({ entity, location });
      return;
    }

    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      referredFrom: props.view,
      location,
      openInNewSplit:
        metadata.openInNewSplit ?? metadata.event?.shiftKey ?? false,
    });
  };

  const [root, setRoot] = createSignal<HTMLDivElement>();
  const [searchInput, setSearchInput] = createSignal<HTMLInputElement>();
  const [viewport, setViewport] = createSignal<HTMLDivElement>();
  const [virtualizer, setVirtualizer] = createSignal<VirtualizerHandle>();
  const [pulling, setPulling] = createSignal(false);
  const [sortOpen, setSortOpen] = createSignal(false);
  const [groupOpen, setGroupOpen] = createSignal(false);
  const { isKeypressActive } = useIsKeyPressActive();

  const docsUrl = () => LIST_VIEW_DOCS_URL[props.view];
  const sortOptions = (): SortOption[] => {
    if (props.view === 'tasks') return TASK_SORT_OPTIONS;
    if (props.view === 'mail') return EMAIL_SORT_OPTIONS;
    if (props.view === 'documents') return DOCUMENT_SORT_OPTIONS;
    if (props.view === 'channels') return CHANNEL_SORT_OPTIONS;
    return DEFAULT_SORT_OPTIONS;
  };
  const showSort = () =>
    props.view !== 'search' &&
    props.view !== 'companies' &&
    props.view !== 'calls' &&
    !(props.view === 'inbox' && isNewInbox());
  const activeSort = () =>
    (collection.sort()[0]?.id as SystemSortOption | undefined) ?? 'updated_at';
  const setActiveSort = (id: SystemSortOption) =>
    collection.setSort([{ id, reversed: false }]);

  const groupOptions = (): GroupOption[] => {
    if (props.view === 'tasks') return TASK_GROUP_OPTIONS;
    if (props.view === 'companies') return COMPANY_GROUP_OPTIONS;
    return [];
  };
  const activeGroup = () =>
    (collection.groupBy() as GroupOptionId | undefined) ?? 'none';
  const setActiveGroup = (id: GroupOptionId) => {
    collection.setGroupBy(id === 'none' ? undefined : id);
    collection.disclosure.expandAll();
  };

  const tabbedView = (): TabbedListView | undefined =>
    props.view in VIEW_TAB_LISTS ? (props.view as TabbedListView) : undefined;
  const tabs = () => {
    const view = tabbedView();
    return view ? VIEW_TAB_LISTS[view] : [];
  };
  const defaultTab = () => VIEW_TAB_PRESETS[props.view]?.default;

  if (!collection.activeTab() && defaultTab()) {
    collection.setActiveTab(defaultTab());
  }

  const presetContext = (): PresetContext => ({
    userId: user.userId(),
    isTeamAdmin: isTeamAdmin(),
    isNewInbox: isNewInbox(),
  });

  const replacePresetFacets = (
    previous: FacetSelection,
    next: FacetSelection
  ) => {
    const facetIds = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const facetId of facetIds) {
      const remove = new Set(previous[facetId] ?? []);
      const retained = collection.facets
        .getSelected(facetId)
        .filter((id) => !remove.has(id));
      collection.facets.set(facetId, [
        ...retained,
        ...(next[facetId] ?? []).filter((id) => !retained.includes(id)),
      ]);
    }
  };

  const applyTabPreset = (tabId: string) => {
    const preset = getViewPreset(props.view, tabId, presetContext());
    if (!preset) return false;
    const currentPreset = getViewPreset(
      props.view,
      collection.activeTab() ?? defaultTab(),
      presetContext()
    );

    batch(() => {
      replacePresetFacets(
        currentPreset?.initialFacets ?? {},
        preset.initialFacets ?? {}
      );
      collection.facets.setExtraFacets(preset.facets ?? []);
      collection.setActiveTab(tabId);
      collection.setEmailView(preset.emailView);
      collection.setGroupBy(preset.groupBy);
      collection.disclosure.expandAll();
    });
    return true;
  };

  const selectedEntity = createMemo(() =>
    entityFromItem(listState.focus.item())
  );
  const selectedEntities = createMemo(() =>
    listState.selection
      .selected()
      .flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
  );

  const {
    previewOpen,
    setPreviewOpen,
    restoredListState,
    persistedPreviewEntity,
  } = useSoupViewEntryState({
    virtualizer,
    initialPreviewOpen: props.initialPreviewOpen,
    defaultPreviewOpen: isNewInbox(),
    restoreCollection: !initialCrmView,
  });

  const isWideSplit = () =>
    (panel.panelSize.width ?? 0) > WIDE_SPLIT_PANEL_BREAKPOINT;
  const previewPaneVisible = () =>
    !isMobile() && isWideSplit() && previewOpen();
  const previewVisible = () =>
    previewPaneVisible() && selectedEntity() !== undefined;

  onMount(() => {
    panel.handle.setDisplayName(props.viewName);
    root()?.focus();

    const teardowns: (() => void)[] = [];
    if (props.view === 'documents') {
      teardowns.push(
        registerDocumentsFilterSplit(panel.handle.id, {
          toggleMarkdownFilter: () =>
            collection.facets.toggle('type', 'doc-markdown'),
        })
      );
    }
    if (props.view === 'search') {
      teardowns.push(
        registerSearchSplit(panel.handle.id, {
          applyFacetOverrides: ({ query, facets }) => {
            const preset = getViewPreset('search');
            collection.facets.hydrate({
              ...(preset?.initialFacets ?? {}),
              ...facets,
              'channel-thread-scope': [NIL_UUID],
            });
            collection.setSearch(query);
          },
          focus: () => searchInput()?.focus(),
        })
      );
    }
    onCleanup(() => {
      for (const teardown of teardowns) teardown();
    });
  });

  createEffect(() => {
    panel.handle.setDisplayName(props.viewName);
  });

  createEffect(() => {
    const visible = previewPaneVisible();
    const [current, setCurrent] = panel.previewState;
    if (current() !== visible) setCurrent(visible);
  });
  onCleanup(() => panel.previewState[1](false));

  const { scrollTo } = useSoupViewHotkeys({
    listScopeId,
    scopeId: props.scopeId,
    view: props.view,
    root,
    virtualizer,
    previewOpen,
    setPreviewOpen,
    activate: activateItem,
    tabs,
    applyTabPreset,
    showSort,
    setSortOpen,
    canNavigate: props.canNavigate,
    onNavigate: props.onNavigate,
  });

  const focusFirstEntity = () => {
    if (isNewInbox() || listState.items.count() === 0) return;
    const firstEntity = listState.items
      .all()
      .find((item) => item.kind === 'entity');
    if (!firstEntity) return;
    const result = listState.navigate.toId(firstEntity.id, {
      reason: 'programmatic',
    });
    if (result) scrollTo(result.index);
  };

  let initialFocusApplied = false;
  createEffect(() => {
    const count = listState.items.count();
    if (initialFocusApplied || count === 0 || dataSource.isLoading()) return;
    initialFocusApplied = true;
    queueMicrotask(() => {
      if (restoredListState?.focus) {
        const restored = listState.focus.restore(restoredListState.focus, {
          reason: 'restore',
          fallback: 'nearest',
        });
        if (restored) scrollTo(restored.index);
        return;
      }
      if (persistedPreviewEntity) {
        const restored = listState.focus.restore(persistedPreviewEntity, {
          reason: 'restore',
          fallback: 'nearest',
        });
        if (restored) scrollTo(restored.index);
        return;
      }
      focusFirstEntity();
    });
  });

  createEffect(
    on(
      [
        collection.search,
        collection.groupBy,
        () => collection.facets.serialize(),
      ],
      () => queueMicrotask(focusFirstEntity),
      { defer: true }
    )
  );

  let selectionAnchor = -1;
  createEffect(() => {
    if (listState.selection.count() === 0) selectionAnchor = -1;
  });

  const setItemSelected = (
    item: SoupItem,
    index: number,
    selected: boolean,
    shiftKey: boolean
  ) => {
    if (!shiftKey) {
      if (selected) listState.selection.select(item);
      else listState.selection.deselect(item.id);
      selectionAnchor = index;
      return;
    }

    if (selectionAnchor < 0) {
      selectionAnchor = index;
    }
    const start = Math.min(selectionAnchor, index);
    const end = Math.max(selectionAnchor, index);
    for (const candidate of listState.items.all().slice(start, end + 1)) {
      if (!listState.selection.isSelectable(candidate)) continue;
      if (selected) listState.selection.select(candidate);
      else listState.selection.deselect(candidate.id);
    }
  };

  const entityRowComponent = () => {
    if (props.view === 'tasks') return TaskListEntity;
    if (props.view === 'companies') return CompanyListEntity;
    if (props.view === 'inbox' && isNewInbox()) return InboxListEntity;
    return ListEntity;
  };

  const renderItem = (
    item: SoupItem,
    index: Accessor<number>,
    state: ListItemState
  ): JSX.Element => {
    if (item.kind === 'group-header') {
      const expanded = () => collection.disclosure.isExpanded(item.groupId);
      return (
        <button
          type="button"
          class="group/header flex min-h-9 w-full items-center gap-2 px-2 text-left text-sm font-medium"
          onClick={() => collection.disclosure.toggle(item.groupId)}
        >
          <CaretRightIcon
            class="size-2.5 shrink-0"
            classList={{ 'rotate-90': expanded() }}
          />
          <span class="truncate">{item.label}</span>
          <Show when={item.count !== undefined}>
            <span class="shrink-0 rounded-full bg-ink/10 px-1.5 py-px text-xs tabular-nums text-ink-extra-muted">
              {item.count}
            </span>
          </Show>
        </button>
      );
    }

    if (item.kind === 'load-more') {
      return (
        <div
          class="my-1 flex min-h-9 items-center justify-center"
          classList={{ 'mx-1 rounded bg-active/60': state.focused() }}
        >
          <Button
            variant="base"
            size="sm"
            depth={2}
            disabled={item.isLoading?.()}
            onClick={() => void item.loadMore()}
          >
            <Show
              when={item.isLoading?.()}
              fallback={<CaretDownIcon class="size-2.5" />}
            >
              <Spinner class="size-3 animate-spin" />
            </Show>
            {item.label ?? 'Load More'}
          </Button>
        </div>
      );
    }

    const onClick = (event: MouseEvent) => {
      if (previewPaneVisible()) {
        const alreadyFocused = state.focused();
        state.focus({ reason: 'pointer' });
        if (
          alreadyFocused &&
          (item.entity.type === 'channel' ||
            item.entity.type === 'channel_message' ||
            item.entity.type === 'channel_thread')
        ) {
          activateItem({
            item,
            index: index(),
            reason: 'pointer',
            metadata: { event, navigateChannelTarget: true },
          });
        }
        return;
      }
      state.focus({ reason: 'pointer' });
      activateItem({
        item,
        index: index(),
        reason: 'pointer',
        metadata: { event },
      });
    };

    return (
      <Dynamic
        component={entityRowComponent()}
        entity={item.entity}
        timestamp={item.entity.updatedAt ?? item.entity.createdAt}
        highlighted={state.focused()}
        checked={state.selected()}
        onMouseMove={() => {
          if (isKeypressActive() || previewOpen() || isNewInbox()) return;
          state.focus({ reason: 'hover' });
        }}
        showUnrollNotifications={
          item.entity.type !== 'email' &&
          collection.facets.has('focus', 'inbox') &&
          !collection.facets.has('focus', 'noise')
        }
        onChecked={(selected: boolean, shiftKey: boolean) =>
          setItemSelected(item, index(), selected, shiftKey)
        }
        onClick={onClick}
        onProjectClick={(project: ProjectEntity, event: MouseEvent) =>
          activateItem({
            item,
            index: index(),
            reason: 'pointer',
            metadata: { event, project },
          })
        }
        onContentHitClick={(event: MouseEvent, location?: SearchLocation) =>
          activateItem({
            item,
            index: index(),
            reason: 'pointer',
            metadata: { event, location },
          })
        }
      />
    );
  };

  const defaultEmptyState = (): JSX.Element => {
    const searchText = collection.search().trim();
    if (searchText) {
      return (
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoSearchGraphic}
          title={`No results for "${searchText}"`}
          description="Try a different query or broaden your filters."
          documentationUrl={docsUrl()}
        />
      );
    }

    if (
      (props.view === 'inbox' || props.view === 'mail') &&
      !emailConnected()
    ) {
      return (
        <EmptyStatePanel
          graphic={
            props.view === 'mail'
              ? EmptyStateEmailGraphic
              : EmptyStateInboxGraphic
          }
          title={
            props.view === 'mail' ? 'Connect your email' : 'Your inbox is empty'
          }
          description="Bring your inbox into Macro to triage signal from noise and reply faster."
          primaryAction={{
            label: 'Connect email',
            onClick: () => void addInbox(),
          }}
          documentationUrl={docsUrl()}
        />
      );
    }

    if (props.view === 'tasks') {
      return (
        <EmptyStatePanel
          graphic={EmptyStateTasksGraphic}
          title="Nothing to do"
          description="Tasks you create or that get assigned to you will show up here."
          primaryAction={{
            label: 'New task',
            icon: PlusIcon,
            onClick: () => runCreateAction('task'),
          }}
          documentationUrl={docsUrl()}
        />
      );
    }

    if (props.view === 'agents') {
      return (
        <EmptyStatePanel
          graphic={EmptyStateAiGraphic}
          title="Get started with agents"
          description="Create an agent, or use Macro with your favorite AI client via MCP."
          primaryAction={{
            label: 'New agent',
            icon: PlusIcon,
            onClick: () => runCreateAction('chat'),
          }}
          documentationUrl={docsUrl()}
        />
      );
    }

    if (props.view === 'companies') {
      return (
        <EmptyStatePanel
          graphic={EmptyStateCompaniesGraphic}
          title="No customers yet"
          description="Customers your team emails will appear here."
        />
      );
    }

    if (
      props.view === 'folders' ||
      (props.view === 'documents' && collection.activeTab() === 'folders')
    ) {
      return (
        <EmptyStatePanel
          graphic={EmptyStateFolderGraphic}
          title="No folders"
          description="Create a folder to organize conversations, documents, and tasks."
          primaryAction={{
            label: 'New folder',
            icon: PlusIcon,
            onClick: () => runCreateAction('project'),
          }}
          documentationUrl={docsUrl()}
        />
      );
    }

    if (props.view === 'documents') {
      return (
        <EmptyStatePanel
          graphic={EmptyStateDocGraphic}
          title="No documents to show"
          primaryAction={{
            label: 'New document',
            icon: PlusIcon,
            onClick: () => runCreateAction('md'),
          }}
          documentationUrl={docsUrl()}
        />
      );
    }

    if (props.view === 'channels') {
      return (
        <EmptyStatePanel
          graphic={EmptyStateChannelsGraphic}
          title="No channels to show"
          primaryAction={{
            label: 'New channel',
            icon: PlusIcon,
            onClick: () => runCreateAction('channel'),
          }}
          documentationUrl={docsUrl()}
        />
      );
    }

    if (props.view === 'calls') {
      return (
        <EmptyStatePanel
          graphic={EmptyStateCallsGraphic}
          title="No calls to show"
          description="Call recordings, transcripts, and summaries will appear here."
          documentationUrl={docsUrl()}
        />
      );
    }

    return (
      <EmptyStatePanel
        centered={props.view === 'search'}
        graphic={EmptyStateInboxGraphic}
        title={props.view === 'search' ? 'No items to show' : 'Inbox zero'}
        description={
          props.view === 'search'
            ? 'Search across messages, documents, tasks, and more.'
            : "You're all caught up."
        }
        documentationUrl={docsUrl()}
      />
    );
  };

  const refresh = async () => {
    setPulling(true);
    try {
      await dataSource.refresh();
    } finally {
      setPulling(false);
    }
  };

  const pull = usePullToRefresh({
    scrollContainer: viewport,
    onRefresh: refresh,
    enabled: () => isMobile(),
    onError: (error) => props.onRefreshError?.(error),
  });

  useSoupNotificationInvalidators();

  return (
    <SplitPanelContext.Provider
      value={{
        ...panel,
        halfSplitState: () =>
          previewVisible() ? { side: 'left', percentage: 30 } : undefined,
      }}
    >
      <div
        ref={(element) => {
          setRoot(element);
          attachHotkeys(element);
        }}
        class="size-full min-h-0 min-w-0 flex flex-col no-select-children"
        tabIndex={-1}
        data-soup-view
        data-list-view={props.view}
        data-soup-view-id={panel.handle.id}
        data-hotkey-scope={listScopeId}
        onFocusIn={(event) => event.stopPropagation()}
      >
        <div class="shrink-0 flex flex-col w-full">
          <SplitHeaderLeft>
            <div class="h-full flex items-center gap-3">
              <Show when={!isMobile()}>
                <div class="flex items-center gap-1">
                  <span class="text-sm font-semibold">{props.viewName}</span>
                  <Show when={docsUrl()}>
                    {(url) => (
                      <Tooltip label="View documentation">
                        <Button
                          variant="ghost"
                          class="p-0.5 rounded-sm text-ink-extra-muted hover:text-ink-muted"
                          label="View documentation"
                          onClick={() => openExternalUrl(url())}
                        >
                          <InfoIcon class="size-3.5" />
                        </Button>
                      </Tooltip>
                    )}
                  </Show>
                </div>
              </Show>
              <Show
                when={props.view === 'companies'}
                fallback={
                  <Show when={tabs().length > 0}>
                    <TabsInset
                      list={tabs()}
                      value={collection.activeTab()}
                      defaultValue={defaultTab()}
                      onChange={applyTabPreset}
                    />
                  </Show>
                }
              >
                <TabsInset
                  list={COMPANY_MODE_TABS}
                  value={collection.viewMode()}
                  defaultValue="board"
                  onChange={(value) =>
                    collection.setViewMode(value === 'list' ? 'list' : 'board')
                  }
                />
              </Show>
              {/* TODO: Mail inbox selector. */}
            </div>
          </SplitHeaderLeft>

          <Show when={!isMobile()}>
            <SplitHeaderRight>
              {/* TODO: Companies saved-view controls. */}
              <Show when={props.view !== 'search'}>
                <SoupViewCreateButton />
              </Show>
              <input
                ref={setSearchInput}
                value={collection.search()}
                onInput={(event) =>
                  collection.setSearch(event.currentTarget.value)
                }
                class="h-7 w-60 rounded-lg border border-edge-muted bg-surface px-2 text-sm outline-none"
                placeholder="Search, @mention contacts"
                aria-label="Search"
              />
            </SplitHeaderRight>

            <SplitToolbarLeft>
              <div class="flex min-w-0 flex-1 items-center gap-1">
                <SoupFacetFilter view={props.view} />
                <Show when={showSort()}>
                  <SortDropdown
                    value={activeSort}
                    onChange={setActiveSort}
                    options={sortOptions()}
                    open={sortOpen()}
                    onOpenChange={setSortOpen}
                  />
                </Show>
                <Show when={props.view === 'inbox' && isNewInbox()}>
                  <TabsInset
                    list={INBOX_READ_TABS}
                    value={readFilter()}
                    defaultValue="unread"
                    onChange={(value) =>
                      updateReadFilter(
                        value === 'read' || value === 'all' ? value : 'unread'
                      )
                    }
                  />
                </Show>
                <Show when={groupOptions().length > 0}>
                  <GroupDropdown
                    value={activeGroup}
                    onChange={setActiveGroup}
                    options={groupOptions()}
                    open={groupOpen()}
                    onOpenChange={setGroupOpen}
                  />
                </Show>
                {/* TODO: active chips, dynamic assignee/company filters, and the Search facet row. */}
              </div>
            </SplitToolbarLeft>
            <SplitToolbarRight>
              <Tooltip
                hotkey={
                  isWideSplit() ? TOKENS.unifiedList.togglePreview : undefined
                }
                label={isWideSplit() ? 'Preview' : 'No space for preview'}
              >
                <Button
                  onClick={() => setPreviewOpen((open) => !open)}
                  variant="base"
                  size="sm"
                  depth={2}
                  class="bg-surface"
                  disabled={!isWideSplit()}
                >
                  {previewOpen() ? <EyeSlashIcon /> : <EyeIcon />}
                  <span>Preview</span>
                </Button>
              </Tooltip>
            </SplitToolbarRight>
          </Show>
        </div>

        <div class="relative grow min-h-0 min-w-0 flex max-sm:flex-col">
          <Resize.Zone direction="horizontal" gutter={0}>
            <Resize.Panel
              id="soup-list"
              minSize={300}
              maxSize={previewPaneVisible() ? 440 : undefined}
            >
              <div class="relative size-full min-h-0 min-w-0">
                <ListLayoutProvider ref={viewport}>
                  <StaticMarkdownContext>
                    <List.Viewport
                      ref={setViewport}
                      class="scrollbar-hidden pb-15 mobile:pt-(--mobile-content-inset-top) mobile:pb-(--mobile-content-inset-bottom)"
                      nearEndOffset={props.nearEndOffset ?? 300}
                      onNearEndError={props.onLoadMoreError}
                    >
                      <List.Content
                        loading={
                          pulling()
                            ? (props.empty ?? defaultEmptyState())
                            : (props.loading ?? (
                                <Spinner class="size-4 animate-spin" />
                              ))
                        }
                        empty={props.empty ?? defaultEmptyState()}
                        error={props.error}
                        forceEmpty={props.forceEmpty}
                      >
                        <List.Virtual<SoupItem>
                          itemSize={props.itemSize ?? DEFAULT_ITEM_SIZE}
                          overscan={props.overscan ?? DEFAULT_OVERSCAN}
                          cache={props.cache ?? restoredListState?.virtualCache}
                          initialScrollOffset={
                            props.initialScrollOffset ??
                            restoredListState?.scrollOffset
                          }
                          virtualizerRef={setVirtualizer}
                        >
                          {(item, index) => (
                            <List.Item item={item}>
                              {(state) => renderItem(item, index, state)}
                            </List.Item>
                          )}
                        </List.Virtual>
                      </List.Content>
                    </List.Viewport>
                  </StaticMarkdownContext>
                </ListLayoutProvider>

                <Show when={!props.customScrollbarHidden}>
                  <CustomScrollbar scrollContainer={viewport} />
                </Show>

                <Show when={selectedEntities().length > 0}>
                  <SoupEntitySelectionToolbar
                    selected={selectedEntities()}
                    onClose={() => root()?.focus()}
                    onClear={listState.selection.clear}
                  />
                </Show>

                <Show when={props.pullIndicator}>
                  {(renderIndicator) => renderIndicator()(pull)}
                </Show>
              </div>
            </Resize.Panel>

            <Show when={previewPaneVisible()}>
              <Resize.Panel
                id="soup-preview"
                minSize={0}
                target={{
                  kind: 'percent',
                  percent: isNewInbox() ? 55 : 70,
                }}
              >
                <div class="size-full">
                  <Show
                    when={selectedEntity()}
                    fallback={
                      <EmptyStatePanel
                        graphic={EmptyStatePreviewIcon}
                        title="Nothing selected"
                        description={
                          isNewInbox()
                            ? 'Select an item from your inbox to preview it here.'
                            : 'Select an item from the list to preview it here'
                        }
                        centered
                      />
                    }
                  >
                    {(entity) => (
                      <PreviewPanel
                        selectedEntity={entity()}
                        orchestrator={orchestrator}
                        splitPanelContext={panel}
                        onFocusOut={() => root()?.focus()}
                      />
                    )}
                  </Show>
                </div>
              </Resize.Panel>
            </Show>
          </Resize.Zone>
        </div>

        {/* TODO: mobile tabs, mobile create, swipe, and long-press actions. */}
      </div>

      <Suspense>
        <Show
          when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile() && !isNewInbox()}
        >
          <SoupChatInput />
        </Show>
      </Suspense>
    </SplitPanelContext.Provider>
  );
}
