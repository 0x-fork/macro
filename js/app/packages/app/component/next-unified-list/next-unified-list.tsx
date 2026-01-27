import PreviewIcon from '@macro-icons/wide/preview.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import SignalIcon from '@macro-icons/wide/signal.svg';
import { createDssInfiniteQuery, type EntityData } from '@macro-entity';
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  on,
  Show,
  Suspense,
} from 'solid-js';
import { EntityWithEverything } from '../../../macro-entity/src/components/EntityWithEverything';
import { TableContent } from '@app/component/next-unified-list/table/table-content';
import { TableRoot } from '@app/component/next-unified-list/table/table-root';
import { TableRow } from '@app/component/next-unified-list/table/table-row';
import { createTableController } from '@app/component/next-unified-list/table/table-controller';
import {
  createFilterState,
  type FilterConfig,
} from '@app/component/next-unified-list/filters';
import {
  buildDssFiltersRequest,
  ENTITY_TYPE_FILTERS,
  type FilterID,
  getEntityTypeFilterIcon,
  getFilterWithID,
  SOUP_FILTERS,
} from '@app/component/next-unified-list/filters/filters';
import { debounce } from '@solid-primitives/scheduled';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import {
  FilterButton,
  FilterDivider,
  ShortcutLabel,
} from '@app/component/Soup/components/FilterButton';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { registerEntityHotkey } from '@app/component/SoupContext';
import { TOKENS } from '@core/hotkey/tokens';
import type { VirtualizerHandle } from 'virtua/solid';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { SortDropdown } from '@app/component/Soup/components/SortDropdown';
import type { SystemSortOption } from '@app/component/ViewConfig';
import { createSelectionState } from '@app/component/next-unified-list/selection-state';

export default function SoupV2() {
  return (
    <Suspense>
      <Soup />
    </Suspense>
  );
}

const timeSort = (
  key: keyof Pick<
    EntityData,
    'updatedAt' | 'createdAt' | 'viewedAt' | 'frecencyScore'
  >
) => {
  return (a: EntityData, b: EntityData) => (a[key] ?? 0) - (b[key] ?? 0);
};

const SORT_CONFIGS: Record<
  SystemSortOption,
  { id: string; sortingFn: (a: EntityData, b: EntityData) => number }
> = {
  updated_at: {
    id: 'updatedAt',
    sortingFn: timeSort('updatedAt'),
  },
  created_at: {
    id: 'createdAt',
    sortingFn: timeSort('createdAt'),
  },
  viewed_at: {
    id: 'viewedAt',
    sortingFn: timeSort('viewedAt'),
  },
  frecency: {
    id: 'frecencyScore',
    sortingFn: timeSort('frecencyScore'),
  },
};

const Soup = () => {
  const panel = useSplitPanelOrThrow();

  const filters = createFilterState({
    filters: [...SOUP_FILTERS],
  });

  const [sort, setSort] = createSignal<SystemSortOption>('updated_at');

  const selection = createSelectionState<EntityData>({
    getItemId(item) {
      return item.id;
    },
  });

  const dssInfiniteQuery = createDssInfiniteQuery(
    () => ({}),
    () => ({
      ...buildDssFiltersRequest(filters.active()),
      limit: 100,
      sort_method: sort(),
    })
  );

  const controller = createTableController<
    EntityData,
    FilterConfig<EntityData>
  >({
    data: () => dssInfiniteQuery.data ?? [],
    initialState: {
      sort: [SORT_CONFIGS.updated_at],
    },
  });

  const focusFirstEntity = () => {
    const next = controller.navigateTo(0);

    if (next) {
      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
    }
  };

  let invalidatedFocus = false;
  let initialLoad = true;
  createEffect(
    on(
      () => dssInfiniteQuery.data,
      (data) => {
        // If we didn't manually invalidate AND it's not the
        // initial load AND there's no data, do nothing
        if (!invalidatedFocus && !initialLoad && !data) {
          return;
        }

        focusFirstEntity();
        invalidatedFocus = false;
        initialLoad = false;
      }
    )
  );

  const invalidateFocus = () => {
    invalidatedFocus = true;
  };

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  registerEntityHotkey({
    hotkey: ['j', 'arrowdown'],
    scopeId: panel.splitHotkeyScope,
    description: 'Down',
    hotkeyToken: TOKENS.entity.step.end,
    keyDownHandler: () => {
      const next = controller.navigateDown();

      if (!next) return true;

      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });

      return true;
    },
    // canExecuteKeyDownHandler: () => canAccessEntityList(),
    hide: true,
  });

  registerEntityHotkey({
    hotkey: ['k', 'arrowup'],
    scopeId: panel.splitHotkeyScope,
    hotkeyToken: TOKENS.entity.step.start,
    description: 'Up',
    keyDownHandler: () => {
      const next = controller.navigateUp();

      if (!next) return true;

      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });

      return true;
    },
    hide: true,
  });

  const isEntitySelected = (id: string) => selection.isSelected(id);

  const toggleEntity = (id: string) => {
    selection.select(controller.table.getRow(id).original);
  };

  const navigateAndSelectEntity = (offset: number) => {
    const nextRow = controller.navigateBy(offset);
    if (!nextRow) return true;
    selection.select(controller.table.getRow(nextRow.id).original);
  };

  const handleNavigationSelection = (offset: number) => {
    const focusedEntity = controller.focusedRowID();
    const currentIndex = focusedEntity
      ? controller.getRowDataIndex(focusedEntity)
      : -1;
    const nextIndex = controller.calculateNavigationIndex(currentIndex, offset);

    const nextRow = controller.table.getRowModel().rows[nextIndex];
    if (!nextRow) return true;

    if (!focusedEntity) {
      navigateAndSelectEntity(offset);
      return true;
    }

    if (selection.count() === 0) {
      selection.select(controller.table.getRow(nextRow.id).original);
      toggleEntity(focusedEntity);
      return true;
    }

    if (!isEntitySelected(focusedEntity) && !isEntitySelected(nextRow.id)) {
      toggleEntity(focusedEntity);
      navigateAndSelectEntity(offset);

      return true;
    }

    if (isEntitySelected(nextRow.id)) {
      toggleEntity(focusedEntity);
      controller.navigateBy(offset);
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

  const activeFilters = createMemo(() => {
    return controller.filters().map((f) => f.id);
  });

  const toggleFilter = (filter: FilterID) => {
    batch(() => {
      filters.toggle(filter);
      controller.setFilters(filters.active());
      invalidateFocus();
    });
  };

  const onSortChange = (sort: SystemSortOption) => {
    batch(() => {
      setSort(sort);
      controller.setSort([SORT_CONFIGS[sort]]);
      invalidateFocus();
    });
  };

  const debouncedFetchMore = debounce(() => {
    if (dssInfiniteQuery.isFetchingNextPage || !dssInfiniteQuery.hasNextPage)
      return;

    dssInfiniteQuery.fetchNextPage();
  });

  return (
    <div class="size-full flex flex-col">
      <div class="relative">
        <div class="flex items-center h-full overflow-x-auto scrollbar-hidden overscroll-none text-xs touch:mobile-width:text-sm">
          {/* Inbox toggle */}
          <FilterButton
            icon={SignalIcon}
            label="Inbox"
            shortcut="i"
            isActive={activeFilters().includes('signal')}
            onClick={() => toggleFilter('signal')}
          />
          {/* Other toggle */}
          <FilterButton
            icon={NoiseIcon}
            label="Other"
            shortcut="o"
            isActive={activeFilters().includes('noise')}
            onClick={() => toggleFilter('noise')}
          />
          <FilterDivider />
          {/* Unread filter */}
          <div class="flex items-center mr-0.5 shrink-0">
            <Tooltip
              tooltip={<LabelAndHotKey label="Unread Only" shortcut="u" />}
            >
              <button
                type="button"
                class="flex items-center gap-1 h-[22px] touch:mobile-width:h-9 pr-2.5 pl-1 active:bg-accent active:text-panel rounded-full"
                // classList={{
                //   'bg-accent text-panel': isUnreadFilterActive(),
                //   'text-ink-muted hover:text-accent hover:bg-accent/20':
                //     !isUnreadFilterActive(),
                // }}
                // onClick={() => toggleUnreadFilter()}
              >
                <svg
                  class="size-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle cx="12" cy="12" r="4" />
                </svg>
                <span class="leading-none">
                  <ShortcutLabel label="Unread" shortcut="u" />
                </span>
              </button>
            </Tooltip>
          </div>
          <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
          {/* Entity type icons */}
          <div class="flex items-center shrink-0">
            <For each={ENTITY_TYPE_FILTERS}>
              {(filter) => {
                const iconConfig = () => getEntityTypeFilterIcon(filter);
                const details = createMemo(() => getFilterWithID(filter));

                return (
                  <FilterButton
                    icon={iconConfig().icon}
                    label={details()?.label ?? ''}
                    shortcut={''}
                    isActive={() => activeFilters().includes(filter)}
                    onClick={() => toggleFilter(filter)}
                    paddingClass="px-2.5"
                  />
                );
              }}
            </For>
          </div>
          <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
          {/* Preview toggle */}
          <Tooltip
            tooltip={<LabelAndHotKey label="Toggle Preview" shortcut="space" />}
          >
            <button
              type="button"
              class="flex items-center gap-1.5 h-[22px] touch:mobile-width:h-9 px-2.5 active:bg-accent active:text-panel rounded-full"
              // classList={{
              //   'bg-accent text-panel': preview(),
              //   'text-ink-muted hover:text-accent hover:bg-accent/20':
              //     !preview(),
              // }}
              onClick={() => {
                // playSound('open');
                // setPreview((prev) => !prev);
              }}
            >
              <PreviewIcon class="size-4.5" />
              <span class="leading-none">
                <ShortcutLabel label="Preview" shortcut="space" />
              </span>
            </button>
          </Tooltip>
          <FilterDivider />
          {/* Sort dropdown */}
          <SortDropdown value={sort} onChange={onSortChange} />
          <div class="touch:mobile-width:-order-1">
            <FilterDivider />
          </div>
          {/* Filter search bar */}
        </div>
      </div>
      <div class="flex flex-col size-full">
        <TableRoot<EntityData, never> controller={controller}>
          <StaticMarkdownContext>
            <TableContent<EntityData>
              virtualizerClass="scrollbar-hidden"
              virtualizerRef={setVirtualizerHandle}
              onScrollBottom={debouncedFetchMore}
            >
              {(row) => (
                <TableRow row={row}>
                  <div
                    class="flex flex-col"
                    style={{
                      'padding-left': `${row.depth * 8}px`,
                    }}
                  >
                    <Show
                      when={!row.getIsGrouped()}
                      fallback={
                        <div class="bg-accent flex gap-2 items-center px-2 py-1 text-input font-medium">
                          <button
                            type="button"
                            onClick={row.getToggleExpandedHandler()}
                          >
                            {row.getIsExpanded() ? 'Close' : 'Open'}
                          </button>
                          <span>{row.groupingValue}</span>
                        </div>
                      }
                    >
                      <EntityWithEverything
                        entity={row.original}
                        selected={{
                          active: controller.focusedRowID() === row.original.id,
                          muted: false,
                        }}
                        showLeftColumnIndicator={false}
                        fadeIfRead={false}
                        showUnrollNotifications={false}
                        showDoneButton={false}
                        highlighted={false}
                        splitId="demo"
                        checked={selection.isSelected(row.id)}
                      />
                    </Show>
                  </div>
                </TableRow>
              )}
            </TableContent>
          </StaticMarkdownContext>
        </TableRoot>
      </div>
    </div>
  );
};
