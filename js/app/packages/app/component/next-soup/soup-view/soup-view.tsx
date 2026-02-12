import CheckIcon from '@icon/bold/check-bold.svg';
import {
  useGlobalBlockOrchestrator,
  useGlobalNotificationSource,
} from '@app/component/GlobalAppState';
import { EntityRow, EntityRowProvider } from '@app/component/mobile/EntityRow';
import {
  makeMarkDoneAction,
  useEntityActionHotkeys,
} from '@app/component/next-soup/actions';
import { useSoup } from '@app/component/next-soup/soup-context';
import { SoupEntityContextMenu } from '@app/component/next-soup/soup-view/soup-entity-context-menu';
import {
  type SoupRow,
  SoupViewContextProvider,
  useSoupView,
} from '@app/component/next-soup/soup-view/soup-view-context';
import { useSoupNavigationHotkeys } from './use-soup-navigation-hotkeys';
import { useSoupViewHotkeys } from './use-soup-view-hotkeys';
import { useElementItemCount } from '@app/component/next-soup/use-element-item-count';
import { registerPreviewEntity } from '@app/signal/splitLayout';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { fileTypeToResolvedBlockName } from '@core/constant/allBlocks';
import {
  openEntityInNewTab,
  openEntityInSplitFromUnifiedList,
} from '@app/component/next-soup/utils';
import {
  PreviewPanel,
  useMaybePreviewPanel,
} from '@app/component/PreviewPanel';
import { SplitPanelContext } from '@app/component/split-layout/context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { LoadingBlock } from '@core/component/LoadingBlock';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { useIsKeyPressActive } from '@core/util/useIsKeyPressActive';
import {
  type EntityData,
  ListEntity,
  type SearchLocation,
  type ProjectEntity,
} from '@entity';
import { queryKeys, useQueryClient } from '@macro-entity';
import { createEffectOnEntityTypeNotification } from '@notifications';
import { debounce } from '@solid-primitives/scheduled';
import { cn } from '@ui/utils/classname';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { type VirtualizerHandle, VList } from 'virtua/solid';
import { SoupEntitySelectionToolbar } from './soup-entity-selection-toolbar';
import { SoupToolbar } from './soup-toolbar';
import { useUserId } from '@core/context/user';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { SoupViewFileDropzone } from '@app/component/next-soup/soup-view/soup-view-file-dropzone';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { invalidateEntityNotifications } from '@queries/notification/user-notifications';
import { soupKeys } from '@queries/soup/keys';
import type { CacheSnapshot } from 'virtua/unstable_core';
import { EmptyState } from '@app/component/next-soup/soup-view/empty-states';
import { SoupChatInput } from '@app/component/SoupChatInput';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { isMobile } from '@core/mobile/isMobile';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import {
  ENTITY_TYPE_FILTER_CONFIGS,
  type FilterID,
} from '@app/component/next-soup/filters/filters';
import { usePropertyEditorHotkeys } from '@app/component/property-edit-modal/hooks/usePropertyEditorHotkeys';

const DEFAULT_ENTITY_HEIGHT = 40;
const IMPLICIT_ALL_VIEW_FILTERS = new Set(['explicit-noise']);
const SIDEBAR_TAB_IDS = new Set<string>([
  'none',
  'all',
  'inbox',
  ...ENTITY_TYPE_FILTER_CONFIGS.map((f) => f.id),
]);

const isAllViewState = (activeFilterIds: string[], search: string) =>
  activeFilterIds.filter((id) => !IMPLICIT_ALL_VIEW_FILTERS.has(id)).length ===
    0 && search.trim().length === 0;

const useSoupNotificationInvalidators = () => {
  const notificationSource = useGlobalNotificationSource();
  const entityQueryClient = useQueryClient();

  createEffectOnEntityTypeNotification(
    notificationSource,
    'channel',
    (notification) => {
      entityQueryClient.invalidateQueries({
        queryKey: soupKeys._def,
      });
      invalidateEntityNotifications(notification.entity_id);
    }
  );

  createEffectOnEntityTypeNotification(notificationSource, 'email', () => {
    entityQueryClient.invalidateQueries({
      // HACK: this needs to be improved, since we use a single query, per entity invalidations
      // become a little more complicated.
      queryKey: queryKeys.all.entity,
    });
  });

  createEffectOnEntityTypeNotification(
    notificationSource,
    'document',
    (notification) => {
      if (notification.notificationEventType === 'task_assigned') {
        entityQueryClient.invalidateQueries({
          queryKey: soupKeys._def,
        });
        invalidateEntityNotifications(notification.entity_id);
      }
    }
  );
};

const stateCache = new Map<
  string,
  {
    soup: {
      focus: string | undefined;
      filters: string[];
      sort: SystemSortOption[];
      selectedSidebarTab: string;
        emailView: 'all' | 'inbox' | 'drafts' | 'sent';
    };
    virtualCache?: CacheSnapshot;
    scrollOffset?: number;
  }
>();

export const SoupView = () => {
  const soup = useSoup();
  const panel = useSplitPanelOrThrow();

  useSoupNotificationInvalidators();

  return (
    <SplitPanelContext.Provider
      value={{
        ...panel,
        halfSplitState: () =>
          soup.previewEntity() ? { side: 'left', percentage: 30 } : undefined,
      }}
    >
      <SoupViewContextProvider soup={soup}>
        <div class="relative flex-grow min-h-0 flex max-sm:flex-col flex-row size-full">
          <SoupToolbar />
          <div class="flex-1 min-w-0">
            <SoupViewFileDropzone>
              <SoupViewList />
            </SoupViewFileDropzone>
          </div>
        </div>
        <Show when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile()}>
          <DockedSoupChatInput />
        </Show>
      </SoupViewContextProvider>
    </SplitPanelContext.Provider>
  );
};

const DockedSoupChatInput = () => {
  const { soup, searchText } = useSoupView();
  const isAllView = createMemo(() =>
    isAllViewState(soup.filters.activeIds(), searchText())
  );
  return <SoupChatInput dockedTall={isAllView()} />;
};

interface SoupViewListProps {
  customScrollbarHidden?: boolean;
  scopeId?: string;
}

export const SoupViewList = (props: SoupViewListProps) => {
  const panel = useSplitPanelOrThrow();
  const {
    soup,
    source,
    rows,
    searchText,
    emailView,
    setEmailView,
    selectedSidebarTab,
    setSelectedSidebarTab,
  } = useSoupView();
  const { getSplitCount } = useSplitLayout();
  const isPreviewOpen = () =>
    soup.previewEntity() !== undefined || panel.previewState[0]();
  const isAllView = createMemo(
    () => isAllViewState(soup.filters.activeIds(), searchText())
  );
  const showWelcomeSplash = createMemo(
    () => selectedSidebarTab() === 'none' && isAllView()
  );

  const { isKeypressActive } = useIsKeyPressActive();

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  const [soupViewRef, setSoupViewRef] = createSignal<HTMLElement | undefined>();

  const [previewPanelRef, setPreviewPanelRef] = createSignal<
    HTMLElement | undefined
  >();

  const focusFirstEntity = () => {
    const next = soup.navigate.toFirst();

    if (next) {
      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
    }
  };

  let initialLoad = true;

  const registerFocusEffects = (moveInitialFocus = true) => {
    if (moveInitialFocus) {
      createEffect(
        on(rows, () => {
          if (!initialLoad || source.isLoading()) return;
          focusFirstEntity();
          initialLoad = false;
        })
      );
    }

    createEffect(
      on(
        () => [soup.filters.activeIds(), searchText()] as const,
        () => {
          focusFirstEntity();
        },
        { defer: true }
      )
    );
  };

  const previewPanel = useMaybePreviewPanel();

  // Auto focus the soup on mount except when it's in a preview panel
  createEffect(() => {
    if (previewPanel) return;

    soupViewRef()?.focus();
  });

  const [attachHotkeys, soupViewScope] = useHotkeyDOMScope('soup-view');

  const scopeId = createMemo(() => {
    return previewPanel
      ? soupViewScope
      : (props.scopeId ?? panel.splitHotkeyScope);
  });

  // Register navigation hotkeys
  useSoupNavigationHotkeys({
    scopeId: scopeId(),
    soup,
    splitHandle: panel.handle,
    virtualizerHandle,
    previewPanelRef,
  });

  // Register entity action hotkeys
  useEntityActionHotkeys({
    scopeId: scopeId(),
    soup,
  });

  // Property editor
  usePropertyEditorHotkeys({
    scopeId: scopeId(),
    soup,
  });

  // Register soup view hotkeys (jump navigation, enter, escape, cmd+k, etc.)
  useSoupViewHotkeys({
    splitId: panel.handle.id,
    scopeId: scopeId(),
    soup,
    splitHandle: panel.handle,
    virtualizerHandle,
    previewState: () => !!soup.previewEntity(),
    getSplitCount,
  });

  // Register previewed entity for auto-attach
  createEffect(() => {
    const entity = soup.previewEntity() ? soup.focus.item() : undefined;
    if (!entity) {
      registerPreviewEntity(panel.handle.id, undefined);
      return;
    }
    const type =
      entity.type === 'document'
        ? fileTypeToResolvedBlockName(
            (entity as { fileType?: string }).fileType
          )
        : entity.type;
    registerPreviewEntity(panel.handle.id, { type, id: entity.id });
  });
  onCleanup(() => {
    registerPreviewEntity(panel.handle.id, undefined);
  });

  // Create markDone action for swipe/click handlers
  const userId = useUserId();
  const notificationSource = useGlobalNotificationSource();

  const markDoneAction = makeMarkDoneAction({
    userId,
    notificationSource: () => notificationSource,
  });

  const debouncedFetchMore = debounce(() => {
    if (source.isFetchingNextPage() || !source.hasNextPage()) return;

    source.fetchNextPage();
  });

  const orchestrator = useGlobalBlockOrchestrator();

  type EntityClickArgs = {
    type: 'entity' | 'project';
    entity: EntityData;
    projectEntity?: ProjectEntity;
    event: MouseEvent | PointerEvent;
    location?: SearchLocation;
  };

  const onEntityClick = async (args: EntityClickArgs) => {
    const { type, event, location } = args;

    const entity = (
      type === 'entity' ? args.entity : args.projectEntity
    ) as EntityData;

    if (event.metaKey || event.ctrlKey) {
      openEntityInNewTab({ entity, location });
      return;
    }

    if (soup.previewEntity() && type === 'entity') {
      soup.focus.set(entity.id);
      return;
    }

    await openEntityInSplitFromUnifiedList(entity, {
      openInNewSplit: event.shiftKey,
      location,
      splitHandle: panel.handle,
    });
  };

  let lastClickedEntityId = -1;

  const getSelectionAnchorIndex = (params: {
    entities: SoupRow[];
    lastClickedIndex: number;
  }) => {
    // Try to grab the last clicked item and fall back on the highest currently
    // selected index.
    let anchorIndex = params.lastClickedIndex;
    if (anchorIndex === -1) {
      for (let i = 0; i < params.entities.length; i++) {
        if (params.entities[i].isSelected()) {
          anchorIndex = i;
        }
      }
    }
    return anchorIndex;
  };

  const handleMultiSelectChecked = (params: {
    entity: EntityData;
    entityIndex: number;
    next: boolean;
    shiftKey: boolean;
  }) => {
    if (!params.shiftKey) {
      soup.selection.toggle(params.entity);
      lastClickedEntityId = params.entityIndex;
      return;
    }

    const entityList = rows();

    const anchorIndex = getSelectionAnchorIndex({
      entities: entityList,
      lastClickedIndex: lastClickedEntityId,
    });

    if (anchorIndex === -1) {
      soup.selection.toggle(params.entity);
      lastClickedEntityId = params.entityIndex;
      return;
    }

    const newEntitiesForSelection = [];
    const sign = Math.sign(params.entityIndex - anchorIndex);

    for (
      let i = anchorIndex;
      sign > 0 ? i <= params.entityIndex : i >= params.entityIndex;
      i += sign
    ) {
      const entity = entityList[i];
      if (!entity.isSelected()) {
        newEntitiesForSelection.push(entity.original);
      }
    }

    soup.selection.selectRange(newEntitiesForSelection);

    lastClickedEntityId = params.entityIndex;
  };

  // reset last clicked on reset multi-selection.
  createEffect(() => {
    if (soup.selection.count() === 0) {
      lastClickedEntityId = -1;
    }
  });

  const [listRef, setListRef] = createSignal<HTMLDivElement>();

  const viewportItemCount = useElementItemCount({
    element: listRef,
    itemHeight: DEFAULT_ENTITY_HEIGHT,
  });

  // Fetch more data if we filter out more items than the viewport can display
  // because it's possible that the match exists on the server
  createEffect(
    on([rows, viewportItemCount], ([rows, viewportItemCount]) => {
      if (rows.length >= viewportItemCount || source.isFetching()) return;
      debouncedFetchMore();
    })
  );

  onCleanup(() => debouncedFetchMore.clear());

  const [localEntityListRef, setLocalEntityListRef] = createSignal<
    HTMLDivElement | undefined
  >();

  const entityById = createMemo(
    () => {
      const list = rows() ?? [];
      const map = new Map<string, SoupRow>();
      for (const entity of list) {
        map.set(entity.original.id, entity);
      }
      return map;
    },
    new Map<string, SoupRow>(),
    {
      equals(prev, next) {
        return prev.size === next.size;
      },
    }
  );

  const getCacheKey = () => {
    let key = `soup-view-${panel.handle.id}`;

    if (previewPanel) {
      key += '-preview';
    }

    return key;
  };

  let hydratedFromCache = false;
  createEffect(() => {
    if (hydratedFromCache) return;
    const cached = stateCache.get(getCacheKey());
    if (!cached) return;

    soup.focus.set(cached.soup.focus);
    for (const id of cached.soup.filters) {
      soup.filters.activate(id);
    }
    soup.sort.setAll(cached.soup.sort);

    const cachedTab = cached.soup.selectedSidebarTab;
    if (SIDEBAR_TAB_IDS.has(cachedTab)) {
      setSelectedSidebarTab(cachedTab as 'none' | 'all' | 'inbox' | FilterID);
    } else {
      setSelectedSidebarTab('none');
    }
    setEmailView(cached.soup.emailView ?? 'all');

    hydratedFromCache = true;
  });

  onCleanup(() => {
    const virtualHandle = virtualizerHandle();

    stateCache.set(getCacheKey(), {
      soup: {
        focus: soup.focus.id(),
        filters: soup.filters.activeIds(),
        sort: soup.sort.active().map((s) => s.id),
        selectedSidebarTab: selectedSidebarTab(),
        emailView: emailView(),
      },
      virtualCache: virtualHandle?.cache,
      scrollOffset: virtualHandle?.scrollOffset,
    });
  });

  const registerVirtualizerHandler = (
    handle: VirtualizerHandle | undefined
  ) => {
    setVirtualizerHandle(handle);

    const cached = stateCache.get(getCacheKey());

    if (!cached) {
      registerFocusEffects();
      return;
    }

    handle?.scrollTo(cached.scrollOffset ?? 0);
    registerFocusEffects(false);
  };

  return (
    <div
      class="size-full flex bracket-never"
      ref={(el) => {
        setSoupViewRef(el);
        attachHotkeys(el);
      }}
      tabIndex={-1}
      onFocusIn={(e) => {
        e.stopPropagation();
      }}
      data-hotkey-scope={soupViewScope}
      data-soup-view
      data-soup-view-id={panel.handle.id + (previewPanel ? '-preview' : '')}
    >
      <div
        ref={setListRef}
        class="@container/uList unified-list-root flex flex-col h-full"
        classList={{
          'w-[225px] min-w-[225px] max-w-[225px] border-r border-edge-muted':
            isPreviewOpen(),
          'flex-1 min-w-0': !isPreviewOpen(),
        }}
      >
        <StaticMarkdownContext>
          <Switch>
            <Match when={source.isLoading()}>
              <LoadingBlock />
            </Match>
            <Match when={showWelcomeSplash()}>
              <AllViewWelcomeState />
            </Match>
            <Match when={!rows().length}>
              <EmptyState search={!!searchText()} />
            </Match>
            <Match when={!source.isLoading() && rows().length}>
              <EntityRowProvider
                container={localEntityListRef}
                canSwipeLeft={(entityId) => {
                  const entity = entityById().get(entityId);
                  if (!entity) return false;
                  return markDoneAction.canExecute(entity.original);
                }}
                onSwipeLeft={(entityId) => {
                  const entity = entityById().get(entityId);
                  if (!entity) return;
                  markDoneAction.executeWithSoup([entity.original], soup);
                }}
                setCollapseEntity={soup.collapseEntity.set}
              >
                <SoupList
                  cache={stateCache.get(getCacheKey())?.virtualCache}
                  ref={setLocalEntityListRef}
                  virtualizerClass="scrollbar-hidden"
                  class="overflow-hidden flex min-w-0"
                  virtualizerRef={registerVirtualizerHandler}
                  onScrollBottom={debouncedFetchMore}
                  rows={rows()}
                >
                  {(row, i) => {
                    const timestamp = () => {
                      const sort_ = soup.sort.active();
                      if (!sort_.length) return;

                      switch (sort_[0].id) {
                        case 'viewed_at':
                          return row.original.viewedAt;
                        case 'created_at':
                          return row.original.createdAt;
                        case 'updated_at':
                          return row.original.updatedAt;
                      }
                    };

                    return (
                      <EntityRow
                        entityId={row.original.id}
                        swipeLeftColor="bg-success"
                        swipeLeftRevealedComponent={
                          <CheckIcon class="size-8 text-panel" />
                        }
                      >
                        <SoupEntityContextMenu
                          entity={row.original}
                          entityTimestamp={timestamp()}
                        >
                          <ListEntity
                            entity={row.original}
                            timestamp={timestamp()}
                            highlighted={
                              panel.isPanelActive() && row.isFocused()
                            }
                            onMouseMove={() => {
                              if (isKeypressActive()) return;
                              if (soup.previewEntity()) return;
                              soup.focus.set(row.original.id);
                            }}
                            showUnrollNotifications={
                              soup.filters.isActive('signal') &&
                              !soup.filters.isActive('noise')
                            }
                            checked={row.isSelected()}
                            onChecked={(next: boolean, shiftKey: boolean) =>
                              handleMultiSelectChecked({
                                entity: row.original,
                                entityIndex: i(),
                                next,
                                shiftKey: shiftKey ?? false,
                              })
                            }
                            onClick={(event: MouseEvent) => {
                              onEntityClick({
                                type: 'entity',
                                entity: row.original,
                                event,
                                location: undefined,
                              });
                            }}
                            onProjectClick={(projectEntity, event) => {
                              onEntityClick({
                                type: 'project',
                                projectEntity,
                                entity: row.original,
                                event,
                                location: undefined,
                              });
                            }}
                            onContentHitClick={(
                              e: PointerEvent | MouseEvent,
                              location?: SearchLocation
                            ) => {
                              onEntityClick({
                                type: 'entity',
                                entity: row.original,
                                event: e,
                                location,
                              });
                            }}
                          />
                        </SoupEntityContextMenu>
                      </EntityRow>
                    );
                  }}
                </SoupList>
              </EntityRowProvider>

              <Show when={!props.customScrollbarHidden}>
                <CustomScrollbar
                  scrollContainer={() => {
                    // Find the actual scroll container (VList creates its own scroll container)
                    const listEl = localEntityListRef();
                    if (!listEl) return undefined;
                    const scrollContainer = listEl.querySelector(
                      '[data-soup-list-container]'
                    ) as HTMLElement;
                    return scrollContainer || undefined;
                  }}
                />
              </Show>
            </Match>
          </Switch>
        </StaticMarkdownContext>
      </div>
      <Show when={soup.selection.count() > 0}>
        <SoupEntitySelectionToolbar
          selected={soup.selection.selected()}
          onClose={soup.selection.clear}
          onClear={soup.selection.clear}
        />
      </Show>
      <Show when={soup.previewEntity() || panel.previewState[0]()}>
        <PreviewPanel
          ref={setPreviewPanelRef}
          selectedEntity={soup.focus.item()}
          orchestrator={orchestrator}
          splitPanelContext={panel}
          onFocusOut={() => {
            soupViewRef()?.focus();
          }}
        />
      </Show>
    </div>
  );
};

const ALL_VIEW_TAGLINES = [
  'this is clean. ship it.',
  'honestly fire, just needs like one more pass',
  "last tweaks incoming & we're golden",
  "very clean, easy to style - let's go",
  'yo this is sick, keep pushing',
  "we're so close, don't stop now",
  "the hard part's done, just polish",
  'trust the vision, this is about to hit',
  'solid work, keep it rolling',
  'this is the way',
  'locked and loaded',
  'the energy here is immaculate',
  "you're cooking with gas",
  "this one's a keeper",
  'all gas no brakes',
  "i'm feeling it",
] as const;

const getRandomAllViewTagline = () => {
  const randomIndex = Math.floor(Math.random() * ALL_VIEW_TAGLINES.length);
  return ALL_VIEW_TAGLINES[randomIndex];
};

const AllViewLogo = (props: { class?: string }) => (
  <svg
    width="994"
    height="658"
    viewBox="0 0 994 658"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class={props.class}
  >
    <path
      d="M17.3154 237.729V512.689L17.3249 513.447C17.4209 517.227 18.2403 520.955 19.7397 524.432C21.3391 528.141 23.6796 531.486 26.6179 534.26L140.151 641.455L223.02 609.049V321.23L100.104 205.324L17.3154 237.729Z"
      fill="#E8985A"
      stroke="black"
    />
    <path
      d="M168.841 32.9999V267.578L225.118 320.656V373.902L516.786 649.24L599.656 616.833L599.611 329.003L251.627 0.582031L168.841 32.9999Z"
      fill="#E8765A"
      stroke="black"
    />
    <path
      d="M545.278 40.3317V274.908L601.599 328.062V380.854L893.322 656.568L976.109 624.165V349.205C976.11 345.167 975.286 341.172 973.687 337.464C972.087 333.755 969.747 330.41 966.808 327.636L628.162 7.9082L545.278 40.3317Z"
      fill="#E85A5A"
      stroke="black"
    />
    <line
      x1="893.278"
      y1="656.568"
      x2="893.278"
      y2="371.531"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="519.211"
      y1="649.242"
      x2="519.211"
      y2="364.205"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="142.27"
      y1="642.584"
      x2="142.27"
      y2="357.547"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="893.432"
      y1="372.634"
      x2="973.349"
      y2="339.336"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="519.365"
      y1="365.306"
      x2="599.282"
      y2="332.008"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="142.423"
      y1="358.648"
      x2="222.34"
      y2="325.349"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="893.357"
      y1="371.711"
      x2="545.718"
      y2="44.0515"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="519.289"
      y1="364.387"
      x2="171.651"
      y2="36.7273"
      stroke="black"
      stroke-width="0.5"
    />
    <line
      x1="142.349"
      y1="357.727"
      x2="17.1454"
      y2="240.516"
      stroke="black"
      stroke-width="0.5"
    />
  </svg>
);

const AllViewWelcomeState = () => {
  const allViewTagline = createMemo(() => getRandomAllViewTagline());

  return (
    <div class="size-full flex items-center justify-center px-6 py-10 pb-28">
      <div class="w-full max-w-3xl flex flex-col items-center gap-8">
        <div class="text-center space-y-4">
          <div class="flex justify-center">
            <AllViewLogo class="h-12 w-auto" />
          </div>
          <h2 class="text-3xl text-ink font-roboto-slab">{allViewTagline()}</h2>
        </div>
      </div>
    </div>
  );
};

const DEFAULT_ITEM_SIZE = 10;
const DEFAULT_OVERSCAN = 5;

interface SoupListProps {
  ref?: (el: HTMLElement) => void;
  virtualizerRef?: (handle: VirtualizerHandle) => void;
  class?: string;
  virtualizerClass?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: SoupRow, index: Accessor<number>) => JSX.Element;
  onScrollBottom?: VoidFunction;
  scrollBottomOffset?: number;
  rows: SoupRow[];
  cache?: CacheSnapshot;
}

const SoupList = (props: SoupListProps) => {
  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  const itemSize = createMemo(() => props.itemSize ?? DEFAULT_ITEM_SIZE);
  const overscan = createMemo(() => props.overscan ?? DEFAULT_OVERSCAN);

  const handleScroll = (offset: number) => {
    const handle = virtualizerHandle();

    if (!handle) return;

    if (
      handle.scrollSize - handle.viewportSize - offset <=
      (props.scrollBottomOffset ?? 100)
    ) {
      props.onScrollBottom?.();
    }
  };

  const registerVirtualizerHandler = (
    handle: VirtualizerHandle | undefined
  ) => {
    setVirtualizerHandle(handle);

    if (handle) {
      props.virtualizerRef?.(handle);
    }
  };

  return (
    <div
      ref={props.ref}
      class={cn('unified-table-body size-full relative', props.class)}
    >
      <VList
        cache={props.cache}
        ref={registerVirtualizerHandler}
        class={props.virtualizerClass}
        data={props.rows}
        itemSize={itemSize()}
        bufferSize={overscan() * itemSize()}
        onScroll={handleScroll}
        data-soup-list-container
      >
        {(row, i) => props.children(row, i)}
      </VList>
    </div>
  );
};
