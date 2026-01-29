import { useSoup } from '@app/component/next-soup/soup-context';
import { PreviewPanel } from '@app/component/PreviewPanel';
import { EmptyState } from '@app/component/UnifiedListEmptyState';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { type EntityData, isTaskEntity } from '@macro-entity';
import {
  Switch,
  Match,
  Show,
  type Accessor,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
  createEffect,
  on,
} from 'solid-js';
import { SoupToolbar } from '@app/component/next-soup/soup-view/soup-toolbar';
import { cn } from '@ui/utils/classname';
import { type VirtualizerHandle, VList } from 'virtua/solid';
import {
  type SoupRow,
  SoupViewContextProvider,
  useSoupView,
} from '@app/component/next-soup/soup-view/soup-view-context';
import { useGlobalBlockOrchestrator } from '@app/component/GlobalAppState';
import { openEntityInNewTab } from '@app/component/next-unified-list/utils';
import { registerEntityHotkey } from '@app/component/SoupContext';
import { openEntityInSplitFromUnifiedList } from '@app/component/soupContextHelpers';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { useTaskProperties } from '@core/component/Properties/hooks';
import { TOKENS } from '@core/hotkey/tokens';
import { useIsKeyPressActive } from '@core/util/useIsKeyPressActive';
import {
  EntityWithEverything,
  type EntityClickHandler,
  type EntityPointerDownHandler,
} from '../../../../macro-entity/src/components/EntityWithEverything';
import { useElementItemCount } from '@app/component/next-soup/use-element-item-count';
import { debounce } from '@solid-primitives/scheduled';
import { LoadingBlock } from '@core/component/LoadingBlock';

const DEFAULT_ENTITY_HEIGHT = 40;

export const SoupView = () => {
  const soup = useSoup();
  return (
    <SoupViewContextProvider soup={soup}>
      <SoupViewImpl />
    </SoupViewContextProvider>
  );
};

const SoupViewImpl = () => {
  const panel = useSplitPanelOrThrow();
  const { soup, query, rows, searchText, setSearchText } = useSoupView();

  const { isKeypressActive } = useIsKeyPressActive();

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  const focusFirstEntity = () => {
    const next = soup.navigate.toFirst();

    if (next) {
      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
    }
  };

  createEffect(
    on(
      () => [soup.filters.activeIds(), searchText()] as const,
      () => {
        focusFirstEntity();
      }
    )
  );

  registerEntityHotkey({
    hotkey: ['j', 'arrowdown'],
    scopeId: panel.splitHotkeyScope,
    description: 'Down',
    hotkeyToken: TOKENS.entity.step.end,
    keyDownHandler: () => {
      const next = soup.navigate.down();

      if (!next) return true;

      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });

      return true;
    },
    hide: true,
  });

  registerEntityHotkey({
    hotkey: ['k', 'arrowup'],
    scopeId: panel.splitHotkeyScope,
    hotkeyToken: TOKENS.entity.step.start,
    description: 'Up',
    keyDownHandler: () => {
      const next = soup.navigate.up();

      if (!next) return true;

      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });

      return true;
    },
    hide: true,
  });

  const navigateAndSelectEntity = (offset: number) => {
    const nextRow = soup.navigate.by(offset);
    if (!nextRow) return true;
    soup.selection.select(nextRow.item);
    virtualizerHandle()?.scrollToIndex(nextRow.index, { align: 'nearest' });
  };

  const handleNavigationSelection = (offset: number) => {
    const focusedEntity = soup.focus.item();
    const nextIndex = soup.navigate.peekOffset(offset);

    const selection = soup.selection;

    const nextRow = nextIndex?.item;
    if (!nextRow) return true;

    if (!focusedEntity) {
      navigateAndSelectEntity(offset);
      return true;
    }

    if (selection.count() === 0) {
      selection.toggle(focusedEntity);
      return true;
    }

    if (
      !selection.isSelected(focusedEntity.id) &&
      !selection.isSelected(nextRow.id)
    ) {
      selection.toggle(focusedEntity);
      navigateAndSelectEntity(offset);

      return true;
    }

    if (selection.isSelected(nextRow.id)) {
      selection.toggle(focusedEntity);
      soup.navigate.by(offset);
      return true;
    }

    navigateAndSelectEntity(offset);

    return true;
  };

  registerEntityHotkey({
    hotkey: ['shift+arrowup', 'shift+k'],
    scopeId: panel.splitHotkeyScope,
    description: 'Select up',
    hotkeyToken: TOKENS.entity.select.start,
    keyDownHandler: () => {
      return handleNavigationSelection(-1);
    },
    // canExecuteKeyDownHandler: () => canAccessEntityList(),
    hide: true,
  });

  registerEntityHotkey({
    hotkey: ['shift+arrowdown', 'shift+j'],
    scopeId: panel.splitHotkeyScope,
    description: 'Select down',
    hotkeyToken: TOKENS.entity.select.end,
    keyDownHandler: () => {
      return handleNavigationSelection(1);
    },
    // canExecuteKeyDownHandler: () => canAccessEntityList(),
    hide: true,
  });

  const debouncedFetchMore = debounce(() => {
    if (query.isFetchingNextPage || !query.hasNextPage) return;

    query.fetchNextPage();
  });

  const orchestrator = useGlobalBlockOrchestrator();

  const taskPropertiesStore = useTaskProperties(soup.data);

  const onEntityClick: EntityClickHandler<EntityData> = async (args) => {
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
      openInNewSplit: event.altKey,
      location,
      splitHandle: panel.handle,
    });
  };

  const onEntityDoubleClick: EntityClickHandler<EntityData> = async (args) => {
    const { entity, event, location } = args;

    if (!soup.previewEntity()) {
      return;
    }

    await openEntityInSplitFromUnifiedList(entity, {
      openInNewSplit: event.altKey,
      location,
      splitHandle: panel.handle,
    });
  };

  const onEntityPointerDown: EntityPointerDownHandler<EntityData> = async (
    args
  ) => {
    const { type, location, event } = args;

    const entity = (
      type === 'entity' ? args.entity : args.projectEntity
    ) as EntityData;

    // middle mouse button pressed
    if (event.button === 1 && event.pointerType === 'mouse') {
      // TODO: current page should remain focused after opening new tab
      openEntityInNewTab({ entity, location });
    }
  };

  const [listRef, setListRef] = createSignal<HTMLDivElement>();

  const viewportItemCount = useElementItemCount({
    element: listRef,
    itemHeight: DEFAULT_ENTITY_HEIGHT,
  });

  // Fetch more data if we filter out more items than the viewport can display
  // because it's possible that the match exists on the server
  createEffect(
    on([rows, viewportItemCount], ([rows, viewportItemCount]) => {
      if (rows.length >= viewportItemCount || query.isLoading) return;
      debouncedFetchMore();
    })
  );

  onCleanup(() => debouncedFetchMore.clear());

  return (
    <div class="relative flex-grow min-h-0 flex max-sm:flex-col flex-row size-full">
      <SoupToolbar onSearchChange={setSearchText} />
      <div ref={setListRef} class="flex flex-col size-full">
        <StaticMarkdownContext>
          <Switch>
            <Match when={query.isLoading}>
              <LoadingBlock />
            </Match>
            <Match when={!rows().length}>
              <EmptyState search={!!searchText()} />
            </Match>
            <Match when={!query.isLoading && rows().length}>
              <SoupList
                virtualizerClass="scrollbar-hidden"
                virtualizerRef={setVirtualizerHandle}
                onScrollBottom={debouncedFetchMore}
                rows={rows()}
              >
                {(row) => {
                  const timestamp = () => {
                    const sort_ = soup.sort();
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

                  const properties = () => {
                    if (isTaskEntity(row.original)) {
                      return taskPropertiesStore()[row.original.id] ?? [];
                    }
                    return undefined;
                  };
                  return (
                    <div
                      class={'unified-table-row'}
                      data-row-id={row.original.id}
                      data-row
                      role="row"
                      tabIndex={0}
                    >
                      <div
                        class="flex flex-col"
                        style={{
                          'padding-left': `${row.depth * 8}px`,
                        }}
                      >
                        <Show
                          when={!row.isGrouped()}
                          fallback={
                            <div class="bg-accent flex gap-2 items-center px-2 py-1 text-input font-medium">
                              <button
                                type="button"
                                onClick={() => row.toggleExpanded()}
                              >
                                {row.isExpanded() ? 'Close' : 'Open'}
                              </button>
                              <span>{row.original.name}</span>
                            </div>
                          }
                        >
                          <EntityWithEverything
                            entity={row.original}
                            timestamp={timestamp()}
                            properties={properties()}
                            searchActive={!!searchText()}
                            selected={{
                              active: soup.focus.id() === row.original.id,
                              muted: false,
                            }}
                            onMouseOver={() => {
                              if (soup.previewEntity() || isKeypressActive())
                                return;
                              soup.focus.set(row.original.id);
                            }}
                            onFocusIn={() => {
                              if (soup.previewEntity()) return;
                              soup.focus.set(row.original.id);
                            }}
                            showLeftColumnIndicator={false}
                            fadeIfRead={false}
                            showUnrollNotifications={false}
                            showDoneButton={false}
                            highlighted={
                              panel.isPanelActive() &&
                              soup.focus.id() === row.original.id
                            }
                            splitId={panel.handle.id}
                            checked={row.isSelected()}
                            onClick={onEntityClick}
                            onDblClick={onEntityDoubleClick}
                            onPointerDown={onEntityPointerDown}
                          />
                        </Show>
                      </div>
                    </div>
                  );
                }}
              </SoupList>
            </Match>
          </Switch>
        </StaticMarkdownContext>
      </div>
      <Show when={soup.previewEntity()}>
        <PreviewPanel
          selectedEntity={soup.focus.item()}
          orchestrator={orchestrator}
          splitPanelContext={panel}
        />
      </Show>
    </div>
  );
};

const DEFAULT_ITEM_SIZE = 10;
const DEFAULT_OVERSCAN = 5;

interface SoupListProps {
  virtualizerRef?: (handle: VirtualizerHandle) => void;
  class?: string;
  virtualizerClass?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: SoupRow, index: Accessor<number>) => JSX.Element;
  onScrollBottom?: VoidFunction;
  scrollBottomOffset?: number;
  rows: SoupRow[];
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
    <div class={cn('unified-table-body size-full relative', props.class)}>
      <VList
        ref={registerVirtualizerHandler}
        class={props.virtualizerClass}
        data={props.rows}
        itemSize={itemSize()}
        bufferSize={overscan() * itemSize()}
        onScroll={handleScroll}
      >
        {(row, i) => props.children(row, i)}
      </VList>
    </div>
  );
};
