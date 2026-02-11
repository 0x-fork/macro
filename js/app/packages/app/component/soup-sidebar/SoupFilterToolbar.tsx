import { type Component, createMemo, For, Show } from 'solid-js';
import { useSoup } from '@app/component/next-soup/soup-context';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import type { FilterID } from '@app/component/next-soup/filters/filters';
import {
  getContextualFiltersForActiveFilters,
  countMatchingEntities,
  type ContextualFilter,
} from './contextual-filters';
import type { ContextualFilterState } from './contextual-filter-state';
import type { EntityData } from '@entity';
import { useUserId } from '@core/context/user';
import { Popover } from '@kobalte/core/popover';
import ChevronDownIcon from '@icon/regular/caret-down.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import FilterIcon from '@macro-icons/pixel/tag.svg';

/**
 * Type filters shown as pills
 */
const TYPE_FILTERS: Array<{ id: FilterID; label: string }> = [
  { id: 'document', label: 'Docs' },
  { id: 'task', label: 'Tasks' },
  { id: 'email', label: 'Mail' },
  { id: 'people', label: 'People' },
  { id: 'teams', label: 'Teams' },
  { id: 'agent', label: 'Agents' },
  { id: 'file', label: 'Files' },
];

/**
 * Status filters shown as pills
 */
const STATUS_FILTERS: Array<{ id: FilterID; label: string }> = [
  { id: 'unread', label: 'Unread' },
  { id: 'not-done', label: 'Not Done' },
];

/**
 * Category labels for contextual filter groups
 */
const CATEGORY_LABELS: Record<string, string> = {
  status: 'Status',
  time: 'Time',
  source: 'Source',
  priority: 'Priority',
  type: 'Type',
  assignee: 'Assignee',
};

/**
 * Category display order
 */
const CATEGORY_ORDER = ['assignee', 'status', 'priority', 'time', 'type', 'source'];

export interface SoupFilterToolbarProps {
  /** Additional class names */
  class?: string;
  /** Original entities before contextual filtering */
  entities?: EntityData[];
  /** Entities after applying active contextual filters (for accurate counts) */
  filteredEntities?: EntityData[];
  /** Contextual filter state */
  contextualFilterState: ContextualFilterState;
}

/**
 * Toolbar with search bar and combined filter dropdown.
 * Search on left, filter button on right - like Linear's display options.
 */
export const SoupFilterToolbar: Component<SoupFilterToolbarProps> = (props) => {
  const soup = useSoup();
  const userId = useUserId();
  const { searchText, setSearchText } = useSoupView();

  // Get contextual filters based on active main filters
  const contextualFilters = createMemo(() => {
    const activeIds = soup.filters.activeIds() as FilterID[];
    const currentUserId = userId();
    return getContextualFiltersForActiveFilters(activeIds, currentUserId);
  });

  // Calculate counts for contextual filters
  const contextualFilterCounts = createMemo(() => {
    const entities =
      props.filteredEntities ?? props.entities ?? (soup.data() as EntityData[]);
    const counts = new Map<string, number>();

    for (const filter of contextualFilters()) {
      counts.set(filter.id, countMatchingEntities(entities, filter));
    }
    return counts;
  });

  // Group contextual filters by category
  const groupedContextualFilters = createMemo(() => {
    const counts = contextualFilterCounts();
    const filters = contextualFilters().filter(
      (f) => (counts.get(f.id) ?? 0) > 0
    );

    const groups = new Map<string, ContextualFilter[]>();
    for (const filter of filters) {
      const category = filter.category ?? 'other';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(filter);
    }

    const sortedGroups: Array<{ category: string; filters: ContextualFilter[] }> = [];
    for (const category of CATEGORY_ORDER) {
      const categoryFilters = groups.get(category);
      if (categoryFilters && categoryFilters.length > 0) {
        sortedGroups.push({ category, filters: categoryFilters });
      }
    }

    for (const [category, categoryFilters] of groups) {
      if (!CATEGORY_ORDER.includes(category) && categoryFilters.length > 0) {
        sortedGroups.push({ category, filters: categoryFilters });
      }
    }

    return sortedGroups;
  });

  const totalActiveFilters = createMemo(() => {
    return (
      soup.filters.activeIds().length +
      props.contextualFilterState.activeIds().size
    );
  });

  const clearAllFilters = () => {
    soup.filters.clear();
    props.contextualFilterState.clear();
  };

  return (
    <div class={`flex border-b border-edge-muted ${props.class ?? ''}`}>
      {/* Search bar - takes remaining space, full height, no rounding */}
      <div class="flex-1 min-w-0 flex items-center gap-2 px-3 bg-panel-muted/50 border-r border-edge-muted focus-within:bg-panel-muted/70 transition-colors">
        <SearchIcon class="size-3.5 text-ink-muted shrink-0" />
        <input
          type="text"
          placeholder="Search..."
          value={searchText()}
          onInput={(e) => setSearchText(e.currentTarget.value)}
          class="flex-1 min-w-0 bg-transparent text-xs text-ink placeholder:text-ink-muted outline-none py-2"
        />
        <Show when={searchText().length > 0}>
          <button
            type="button"
            class="text-ink-muted hover:text-ink text-xs"
            onClick={() => setSearchText('')}
          >
            ×
          </button>
        </Show>
      </div>

      {/* Combined filter dropdown - right side */}
      <Popover placement="bottom-end" gutter={4}>
        <Popover.Trigger
          as="button"
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-2 text-xs transition-colors shrink-0"
          classList={{
            'bg-accent/15 text-accent': totalActiveFilters() > 0,
            'text-ink-muted hover:text-ink hover:bg-ink/10': totalActiveFilters() === 0,
          }}
        >
          <FilterIcon class="size-3.5" />
          <span>Filter</span>
          <Show when={totalActiveFilters() > 0}>
            <span class="bg-accent text-panel text-[10px] px-1.5 rounded-full min-w-[18px] text-center">
              {totalActiveFilters()}
            </span>
          </Show>
          <ChevronDownIcon class="size-3 opacity-50" />
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content class="z-50 bg-panel border border-edge-muted rounded-lg shadow-lg w-[320px]">
            {/* Type filters as pills */}
            <div class="p-3">
              <div class="text-[10px] font-medium text-ink-extra-muted uppercase tracking-wider mb-2">
                Type
              </div>
              <div class="flex flex-wrap gap-1.5">
                <For each={TYPE_FILTERS}>
                  {(filter) => {
                    const isActive = () => soup.filters.activeIds().includes(filter.id);
                    return (
                      <button
                        type="button"
                        class="px-2.5 py-1 text-xs rounded transition-colors"
                        classList={{
                          'bg-accent text-panel': isActive(),
                          'bg-panel-muted text-ink-muted hover:bg-ink/10 hover:text-ink': !isActive(),
                        }}
                        onClick={() => soup.filters.toggle(filter.id)}
                      >
                        {filter.label}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Divider */}
            <div class="border-t border-edge-muted" />

            {/* Status filters as pills */}
            <div class="p-3">
              <div class="text-[10px] font-medium text-ink-extra-muted uppercase tracking-wider mb-2">
                Status
              </div>
              <div class="flex flex-wrap gap-1.5">
                <For each={STATUS_FILTERS}>
                  {(filter) => {
                    const isActive = () => soup.filters.activeIds().includes(filter.id);
                    return (
                      <button
                        type="button"
                        class="px-2.5 py-1 text-xs rounded transition-colors"
                        classList={{
                          'bg-accent text-panel': isActive(),
                          'bg-panel-muted text-ink-muted hover:bg-ink/10 hover:text-ink': !isActive(),
                        }}
                        onClick={() => soup.filters.toggle(filter.id)}
                      >
                        {filter.label}
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>

            {/* Contextual filter sections as nested dropdowns */}
            <For each={groupedContextualFilters()}>
              {(group) => (
                <>
                  <div class="border-t border-edge-muted" />
                  <ContextualFilterSection
                    label={CATEGORY_LABELS[group.category] ?? group.category}
                    filters={group.filters}
                    counts={contextualFilterCounts()}
                    contextualFilterState={props.contextualFilterState}
                  />
                </>
              )}
            </For>

            {/* Footer with count and clear button */}
            <Show when={totalActiveFilters() > 0}>
              <div class="flex items-center justify-between px-3 py-2.5 border-t-2 border-accent/20 bg-accent/5">
                <span class="text-xs font-medium text-ink">
                  {totalActiveFilters()} filter{totalActiveFilters() > 1 ? 's' : ''} active
                </span>
                <button
                  type="button"
                  class="text-xs font-medium text-accent hover:text-accent/80 transition-colors px-2 py-0.5 rounded hover:bg-accent/10"
                  onClick={clearAllFilters}
                >
                  Clear all
                </button>
              </div>
            </Show>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </div>
  );
};

interface ContextualFilterSectionProps {
  label: string;
  filters: ContextualFilter[];
  counts: Map<string, number>;
  contextualFilterState: ContextualFilterState;
}

/**
 * Dropdown for contextual filters within the main dropdown
 */
const ContextualFilterSection: Component<ContextualFilterSectionProps> = (props) => {
  const activeCount = createMemo(() => {
    return props.filters.filter((f) => props.contextualFilterState.isActive(f.id)).length;
  });

  const activeLabels = createMemo(() => {
    return props.filters
      .filter((f) => props.contextualFilterState.isActive(f.id))
      .map((f) => f.label);
  });

  return (
    <div class="flex items-center gap-2 px-3 py-2">
      {/* Label on left */}
      <span class="text-xs text-ink-muted">{props.label}</span>
      
      {/* Dropdown on right */}
      <Popover placement="bottom-end" gutter={4}>
        <Popover.Trigger
          as="button"
          type="button"
          class="flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-left rounded-md border border-edge-muted hover:bg-ink/5 transition-colors ml-auto min-w-[140px]"
        >
          <Show when={activeCount() > 0} fallback={
            <>
              <span class="text-xs text-ink-muted">Any</span>
              <ChevronDownIcon class="size-3 text-ink-muted shrink-0" />
            </>
          }>
            <span class="text-xs text-accent truncate max-w-[160px]">
              {activeLabels().join(', ')}
            </span>
            <ChevronDownIcon class="size-3 text-accent shrink-0" />
          </Show>
        </Popover.Trigger>

        <Popover.Portal>
          <Popover.Content class="z-[60] bg-panel border border-edge-muted rounded-lg shadow-lg w-[280px] p-2">
            <div class="flex flex-wrap gap-1.5">
              <For each={props.filters}>
                {(filter) => {
                  const count = () => props.counts.get(filter.id) ?? 0;
                  const isActive = () => props.contextualFilterState.isActive(filter.id);
                  return (
                    <button
                      type="button"
                      class="px-2.5 py-1 text-xs rounded transition-colors"
                      classList={{
                        'bg-accent text-panel': isActive(),
                        'bg-panel-muted text-ink-muted hover:bg-ink/10 hover:text-ink': !isActive(),
                      }}
                      onClick={() => props.contextualFilterState.toggle(filter)}
                    >
                      {filter.label}
                      <span class="ml-1 opacity-60">{count()}</span>
                    </button>
                  );
                }}
              </For>
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </div>
  );
};

export default SoupFilterToolbar;
