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
import { queryKeys } from '@macro-entity';
import { useQueryClient } from '@queries/client';
import { createEffectOnEntityTypeNotification } from '@notifications';
import { debounce } from '@solid-primitives/scheduled';
import { cn } from '@ui/utils/classname';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  on,
  onCleanup,
  Show,
  Suspense,
  Switch,
} from 'solid-js';
import { SoupEntitySelectionToolbar } from './soup-entity-selection-toolbar';
import { SoupToolbar } from './soup-toolbar';
import { useUserId } from '@core/context/user';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { SoupViewFileDropzone } from '@app/component/next-soup/soup-view/soup-view-file-dropzone';
import { useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { invalidateEntityNotifications } from '@queries/notification/user-notifications';
import { soupKeys } from '@queries/soup/keys';
import { EmptyState } from '@app/component/next-soup/soup-view/empty-states';
import { SoupChatInput } from '@app/component/SoupChatInput';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { isMobile } from '@core/mobile/isMobile';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { usePropertyEditorHotkeys } from '@app/component/property-edit-modal/hooks/usePropertyEditorHotkeys';
import type { SoupItemsQueryFilters } from '@queries/soup/items';
import {
  createVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from '@tanstack/solid-virtual';
import { onMount } from 'solid-js';
import { CircleSpinner } from '@core/component/CircleSpinner';

type SoupVirutalizer = Virtualizer<HTMLElement, Element>;

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
      if (notification.notification_event_type === 'task_assigned') {
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
      queryFilters: SoupItemsQueryFilters;
      sort: SystemSortOption[];
      searchText: string;
    };
    virtualCache?: VirtualItem[];
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
        <div class="relative flex-grow min-h-1 flex max-sm:flex-col flex-row size-full">
          <Suspense>
            <SoupToolbar />
          </Suspense>
          <SoupViewFileDropzone>
            <SoupViewList />
          </SoupViewFileDropzone>
        </div>
        <Suspense>
          <Show when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile()}>
            <SoupChatInput />
          </Show>
        </Suspense>
      </SoupViewContextProvider>
    </SplitPanelContext.Provider>
  );
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
    setSearchText,
    setQueryFilters,
    queryFilters,
    featuredIds,
  } = useSoupView();
  const { getSplitCount } = useSplitLayout();

  const { isKeypressActive } = useIsKeyPressActive();

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<SoupVirutalizer>();

  const [soupViewRef, setSoupViewRef] = createSignal<HTMLElement | undefined>();

  const [previewPanelRef, setPreviewPanelRef] = createSignal<
    HTMLElement | undefined
  >();

  const debouncedScrollTo = debounce((index: number) => {
    virtualizerHandle()?.scrollToIndex(index, { align: 'auto' });
  }, 50);

  const focusFirstEntity = () => {
    const next = soup.navigate.toFirst();

    if (next) {
      debouncedScrollTo(next.index);
    }
  };

  const [focusEffectsEnabled, setFocusEffectsEnabled] = createSignal(false);
  const [moveInitialFocus, setMoveInitialFocus] = createSignal(true);

  let initialLoad = true;

  // Initial load: focus first entity once rows arrive
  createEffect(
    on(rows, () => {
      if (!focusEffectsEnabled() || !moveInitialFocus()) return;
      if (!initialLoad || source.isLoading()) return;
      focusFirstEntity();
      initialLoad = false;
    })
  );

  // Focus first entity on filter/search changes
  createEffect(
    on(
      () => [soup.filters.activeIds(), searchText(), featuredIds()] as const,
      () => {
        if (!focusEffectsEnabled()) return;
        focusFirstEntity();
      },
      { defer: true }
    )
  );

  const registerFocusEffects = (shouldMoveInitialFocus = true) => {
    setMoveInitialFocus(shouldMoveInitialFocus);
    setFocusEffectsEnabled(true);
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
    splitHandle: panel.handle,
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
  }, 15);

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

  const isProjectList = panel.handle.content().type === 'project';

  const getCacheKey = () => {
    let key = `soup-view-${panel.handle.id}`;

    if (previewPanel) {
      key += '-preview';
    }

    return key;
  };

  onCleanup(() => {
    const virtualHandle = virtualizerHandle();

    if (isProjectList) return;

    stateCache.set(getCacheKey(), {
      soup: {
        focus: soup.focus.id(),
        filters: soup.filters.activeIds(),
        queryFilters: queryFilters(),
        sort: soup.sort.active().map((s) => s.id),
        searchText: searchText(),
      },
      virtualCache: virtualHandle?.measurementsCache ?? [],
      scrollOffset: virtualHandle?.scrollOffset ?? 0,
    });
  });

  let restored = false;
  const restoreState = () => {
    if (restored || isProjectList) return;

    restored = true;

    const cached = stateCache.get(getCacheKey());

    if (!cached) {
      registerFocusEffects();
      return;
    }

    soup.focus.set(cached.soup.focus);
    for (const id of cached.soup.filters) {
      soup.filters.activate(id);
    }

    setQueryFilters(cached.soup.queryFilters);
    setSearchText(cached.soup.searchText);

    soup.sort.setAll(cached.soup.sort);

    virtualizerHandle()?.scrollToOffset(cached.scrollOffset ?? 0);
    registerFocusEffects(false);
  };

  const registerVirtualizerHandler = (handle: SoupVirutalizer | undefined) => {
    setVirtualizerHandle(handle);

    restoreState();
  };

  const featuredCount = createMemo(() => featuredIds().length);

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
        class="@container/uList size-full unified-list-root flex flex-col"
        classList={{
          'border-r border-edge-muted': soup.previewEntity() !== undefined,
        }}
      >
        <StaticMarkdownContext>
          <Switch>
            <Match when={source.isLoading() && !rows().length}>
              <LoadingBlock />
            </Match>
            <Match when={!source.isLoading() && !rows().length}>
              <EmptyState search={!!searchText()} />
            </Match>
            <Match when={rows().length}>
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
                  scrollBottomOffset={300}
                  rows={rows()}
                  bottomContent={
                    <div class="w-full flex items-center gap-2 py-2 px-7">
                      <CircleSpinner />
                      <span class="text-sm font-semibold">Loading...</span>
                    </div>
                  }
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

                    createEffect(() => {
                      if (i() === Math.floor(rows().length * 0.8)) {
                        debouncedFetchMore();
                      }
                    });

                    return (
                      <>
                        <Show when={i() === 0 && featuredCount() > 0}>
                          <div class="px-3 py-1.5 text-xs text-text-muted font-medium">
                            Featured Results
                          </div>
                        </Show>
                        <Show
                          when={i() === featuredCount() && featuredCount() > 0}
                        >
                          <div class="px-3 py-1.5 text-xs text-text-muted font-medium border-t border-edge-muted mt-1">
                            More Results
                          </div>
                        </Show>
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
                      </>
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

const DEFAULT_ITEM_SIZE = 40;
const DEFAULT_OVERSCAN = 25;

interface SoupListProps {
  ref?: (el: HTMLElement) => void;
  virtualizerRef?: (handle: SoupVirutalizer) => void;
  class?: string;
  virtualizerClass?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: SoupRow, index: Accessor<number>) => JSX.Element;
  onScrollBottom?: VoidFunction;
  scrollBottomOffset?: number;
  rows: SoupRow[];
  cache?: VirtualItem[];
  bottomContent?: JSX.Element;
}

const SoupList = (props: SoupListProps) => {
  const itemSize = createMemo(() => props.itemSize ?? DEFAULT_ITEM_SIZE);
  const overscan = createMemo(() => props.overscan ?? DEFAULT_OVERSCAN);

  const [scrollElement, setScrollElement] = createSignal<HTMLElement>();

  const virtualizer = createVirtualizer({
    getScrollElement() {
      return scrollElement() ?? null;
    },
    get count() {
      return props.rows.length;
    },
    initialMeasurementsCache: props.cache,
    estimateSize() {
      return itemSize();
    },
    overscan: overscan(),
    getItemKey(index) {
      return props.rows[index]?.id ?? index;
    },
    initialRect: {
      width: 1920,
      height: 1080,
    },
    // useAnimationFrameWithResizeObserver: true,
  });

  props.virtualizerRef?.(virtualizer);

  const handleScroll = (e: Event) => {
    const target = e.currentTarget;

    if (!(target instanceof HTMLElement)) return;

    const offset = target.scrollTop;
    const height = target.clientHeight;
    const scrollHeight = target.scrollHeight;

    if (scrollHeight - height - offset <= (props.scrollBottomOffset ?? 100)) {
      props.onScrollBottom?.();
    }
  };

  let io: IntersectionObserver | undefined;

  const initializeIntersectionObserver = (element: HTMLElement) => {
    if (io) return;

    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          props.onScrollBottom?.();
          break;
        }
      },
      {
        root: element,
      }
    );
  };

  onCleanup(() => {
    io?.disconnect();
  });

  const registerViewportElement = (element: HTMLElement) => {
    props.ref?.(element);
    initializeIntersectionObserver(element);
  };

  return (
    <div
      ref={registerViewportElement}
      class={cn(
        'unified-table-body size-full relative overflow-hidden',
        props.class
      )}
    >
      <div
        ref={(el) => {
          onMount(() => {
            setScrollElement(el);
            queueMicrotask(() => {
              virtualizer._willUpdate();
            });
          });
        }}
        class="relative size-full overflow-auto"
        onScroll={handleScroll}
      >
        <div
          class="size-full relative"
          data-soup-list-container
          style={{
            // contain: 'strict',
            // transform: `translateY(${virtualizer.getVirtualItems()[0]?.start}px)`,
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          <For each={virtualizer.getVirtualItems()}>
            {(virtual) => {
              const row = createMemo(() => {
                return props.rows[virtual.index];
              });

              return (
                <Show when={row()}>
                  <div
                    ref={(el) => {
                      onMount(() => {
                        virtualizer.measureElement(el);
                      });
                    }}
                    data-index={virtual.index}
                    class="w-full max-h-min absolute top-0 left-0"
                    style={{
                      contain: 'strict',
                      transform: `translateY(${virtual.start}px)`,
                      'min-height': `${virtual.size}px`,
                    }}
                  >
                    {props.children(row(), () => virtual.index)}
                  </div>
                </Show>
              );
            }}
          </For>
        </div>
        {props.bottomContent}
        <div
          class="w-full h-2 bg-red"
          ref={(el) => {
            onMount(() => {
              io?.observe(el);
            });
          }}
        />
      </div>
    </div>
  );
};
