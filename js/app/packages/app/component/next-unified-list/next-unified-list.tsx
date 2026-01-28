import IconGear from '@macro-icons/macro-gear.svg';
import XIcon from '@icon/regular/x.svg?component-solid';
import PreviewIcon from '@macro-icons/wide/preview.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import SignalIcon from '@macro-icons/wide/signal.svg';
import type { WithSearch, EntityData } from '@macro-entity';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  Show,
  Suspense,
} from 'solid-js';
import { EntityWithEverything } from '../../../macro-entity/src/components/EntityWithEverything';
import { TableRow } from '@app/component/next-unified-list/table/table-row';
import {
  buildDssFiltersRequest,
  ENTITY_TYPE_FILTERS,
  type FilterID,
  getEntityTypeFilterIcon,
  getFilterWithID,
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
import { VList, type VirtualizerHandle } from 'virtua/solid';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { Row } from '@tanstack/solid-table';
import { cn } from '@ui/utils/classname';
import {
  createSoupState,
  type SoupState,
} from '@app/component/next-unified-list/soup-context';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import type { SearchArgs } from '@service-search/client';
import { debouncedDependent } from '@core/util/debounce';
import type { UnifiedSearchIndex } from '@service-search/generated/models';
import { arrayEquals } from '@core/util/compareUtils';
import { fuzzyMatch } from '@core/util/fuzzy';
import { deduplicateEntities } from '@app/component/next-unified-list/utils';
import { useSoupQuery } from '@app/component/next-unified-list/soup-query/use-soup-query';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { useSettingsState } from '@core/constant/SettingsState';
import { PreviewPanel } from '@app/component/PreviewPanel';
import { useGlobalBlockOrchestrator } from '@app/component/GlobalAppState';

const SEARCH_SERVICE_DEBOUNCE_MS = 300;
const LOCAL_FUZZY_SEARCH_DEBOUNCE_MS = 20;

export default function SoupV2() {
  return (
    <Suspense>
      <Soup />
    </Suspense>
  );
}

const Soup = () => {
  const panel = useSplitPanelOrThrow();
  const soup = createSoupState();

  const [searchText, setSearchText] = createSignal('');

  const debouncedSearchForLocal = debouncedDependent(
    searchText,
    LOCAL_FUZZY_SEARCH_DEBOUNCE_MS
  );
  const debouncedSearchForService = debouncedDependent(
    searchText,
    SEARCH_SERVICE_DEBOUNCE_MS
  );

  const unifiedSearchIncludeArray = createMemo<UnifiedSearchIndex[]>(
    () => {
      let types = soup.filters.activeIds();
      // NOTE: empty array means search all
      if (types.length === 0) types = [];
      const includeArray: UnifiedSearchIndex[] = [];
      for (const type of types) {
        switch (type) {
          case 'document':
          case 'task':
            includeArray.push('documents');
            break;
          case 'chat':
            includeArray.push('chats');
            break;
          case 'channel':
            includeArray.push('channels');
            break;
          case 'email':
            includeArray.push('emails');
            break;
          case 'project':
            includeArray.push('projects');
            break;
        }
      }
      return Array.from(new Set(includeArray));
    },
    [],
    { equals: arrayEquals }
  );

  const validSearchTerms = createMemo(
    () => debouncedSearchForService().length >= 3
  );
  const isSearchActive = createMemo(() => validSearchTerms());
  const disableSearchService = createMemo(() => {
    return !isSearchActive();
  });

  const searchUnifiedNameContentQueryParams = createMemo(
    (): SearchArgs => ({
      params: {
        cursor: null,
        page_size: 100,
      },
      request: {
        search_on: 'name_content',
        match_type: 'partial',
        terms:
          debouncedSearchForService().length > 0
            ? [debouncedSearchForService()]
            : undefined,
        // filters: unifiedSearchFilters(),
        include: unifiedSearchIncludeArray(),
      },
    })
  );

  const query = useSoupQuery(() => ({
    params: {},
    body: {
      ...buildDssFiltersRequest(soup.filters.active()),
      limit: 100,
      search: {
        ...searchUnifiedNameContentQueryParams().request,
      },
    },
  }));

  const nameFuzzySearchFilter = createMemo(() =>
    searchText()
      ? (items: EntityData[]) => {
          const query = debouncedSearchForLocal();
          if (!query || query.length === 0) return items;

          const matchResults = fuzzyMatch(query, items, (item) => item.name);

          return matchResults.map((result) => {
            return {
              ...result.item,
              search: {
                nameHighlight: result.nameHighlight,
                contentHitData: null,
                source: 'local',
              },
            } as WithSearch<EntityData>;
          });
        }
      : undefined
  );

  const focusFirstEntity = () => {
    const next = soup.navigate.toFirst();

    if (next) {
      virtualizerHandle()?.scrollToIndex(next.index, { align: 'nearest' });
    }
  };

  let initialLoad = true;
  createEffect(
    on(
      () => query.data,
      (data) => {
        if (data) {
          const localSearch = nameFuzzySearchFilter();
          soup.setData(
            searchText()
              ? deduplicateEntities([...data, ...(localSearch?.(data) ?? [])])
              : data
          );
        }
        // If we didn't manually invalidate AND it's not the
        // initial load AND there's no data, do nothing
        if (!initialLoad || !data) {
          return;
        }

        focusFirstEntity();
        initialLoad = false;
      }
    )
  );

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

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
    // canExecuteKeyDownHandler: () => canAccessEntityList(),
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
      selection.select(nextRow);
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

  return (
    <div class="relative flex-grow min-h-0 flex max-sm:flex-col flex-row size-full">
      <SplitHeaderLeft>
        <div class="flex">
          <SoupToolbar soup={soup} />
          <input
            type="text"
            onInput={(e) => {
              setSearchText(e.currentTarget.value);
            }}
          />
        </div>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <div class="flex items-center h-full gap-0.5">
          <Tooltip
            tooltip={<LabelAndHotKey label="Clear filters" shortcut="/" />}
          >
            <button
              type="button"
              class="flex items-center gap-1.5 px-2.5 rounded-full text-ink-muted hover:text-accent hover:bg-accent/20 active:bg-accent active:text-panel"
              onClick={soup.filters.clear}
            >
              <XIcon class="size-4.5" />
              <span class="text-xs touch:mobile-width:text-sm leading-none">
                Clear
                <span class="ml-1 font-mono opacity-70">/</span>
              </span>
            </button>
          </Tooltip>
          <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
          <SettingsButton />
        </div>
      </SplitHeaderRight>
      <div class="flex flex-col size-full">
        <StaticMarkdownContext>
          <SoupList
            virtualizerClass="scrollbar-hidden"
            virtualizerRef={setVirtualizerHandle}
            onScrollBottom={debouncedFetchMore}
            rows={soup.items.rows()}
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
                      searchActive={!!searchText()}
                      entity={row.original}
                      selected={{
                        active: soup.focus.id() === row.original.id,
                        muted: false,
                      }}
                      showLeftColumnIndicator={false}
                      fadeIfRead={false}
                      showUnrollNotifications={false}
                      showDoneButton={false}
                      highlighted={false}
                      splitId="demo"
                      checked={soup.selection.isSelected(row.id)}
                    />
                  </Show>
                </div>
              </TableRow>
            )}
          </SoupList>
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

const DEFAULT_ITEM_SIZE = 50;
const DEFAULT_OVERSCAN = 5;

interface SoupListProps {
  virtualizerRef?: (handle: VirtualizerHandle) => void;
  class?: string;
  virtualizerClass?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: Row<EntityData>, index: Accessor<number>) => JSX.Element;
  onScrollBottom?: VoidFunction;
  scrollBottomOffset?: number;
  rows: Row<EntityData>[];
}

const SoupList = (props: SoupListProps) => {
  // TODO: Handle fallback states?

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  const rows = createMemo(() => props.rows);

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
        data={rows()}
        itemSize={itemSize()}
        bufferSize={overscan() * itemSize()}
        onScroll={handleScroll}
      >
        {(row, i) => props.children(row, i)}
      </VList>
    </div>
  );
};

interface SoupToolbarProps {
  soup: SoupState;
}

const SoupToolbar = (props: SoupToolbarProps) => {
  const toggleFilter = (filter: FilterID) => {
    props.soup.filters.toggle(filter);
  };
  return (
    <div class="relative">
      <div class="flex items-center h-full overflow-x-auto scrollbar-hidden overscroll-none text-xs touch:mobile-width:text-sm">
        {/* Inbox toggle */}
        <FilterButton
          icon={SignalIcon}
          label="Inbox"
          shortcut="i"
          isActive={props.soup.filters.isActive('signal')}
          onClick={() => toggleFilter('signal')}
        />
        {/* Other toggle */}
        <FilterButton
          icon={NoiseIcon}
          label="Other"
          shortcut="o"
          isActive={props.soup.filters.isActive('noise')}
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
                  isActive={() => props.soup.filters.isActive(filter)}
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
            classList={{
              'bg-accent text-panel': !!props.soup.previewEntity(),
              'text-ink-muted hover:text-accent hover:bg-accent/20':
                !props.soup.previewEntity(),
            }}
            disabled={!props.soup.focus.id()}
            onClick={() => {
              const currentPreview = props.soup.previewEntity();
              if (currentPreview) {
                props.soup.setPreviewEntity(undefined);
                return;
              }

              const focused = props.soup.focus.id();

              if (!focused) return;

              props.soup.setPreviewEntity(focused);
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
        {/* <SortDropdown value={soup.sort()} onChange={onSortChange} /> */}
        <div class="touch:mobile-width:-order-1">
          <FilterDivider />
        </div>
        {/* Filter search bar */}
      </div>
    </div>
  );
};

function SettingsButton() {
  const { settingsOpen, toggleSettings } = useSettingsState();
  const { getSplitCount } = useSplitLayout();

  // Hide settings button when there are multiple splits
  const isSingleSplit = () => getSplitCount() <= 1;

  return (
    <Show when={isSingleSplit()}>
      <Tooltip
        tooltip={
          <LabelAndHotKey
            label={settingsOpen() ? 'Close Settings' : 'Open Settings'}
            hotkeyToken={TOKENS.global.toggleSettings}
          />
        }
      >
        <button
          type="button"
          class="relative flex items-center justify-center size-[22px] rounded-full active:bg-accent active:text-panel"
          classList={{
            'bg-hover text-ink': settingsOpen(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !settingsOpen(),
          }}
          onClick={() => toggleSettings()}
        >
          <IconGear class="size-4.5" />
        </button>
      </Tooltip>
    </Show>
  );
}
