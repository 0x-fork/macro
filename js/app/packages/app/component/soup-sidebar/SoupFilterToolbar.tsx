import { type Component, createMemo, For, Show } from 'solid-js';
import { FilterDropdown, type FilterOption } from './FilterDropdown';
import { useSoup } from '@app/component/next-soup/soup-context';
import type { FilterID } from '@app/component/next-soup/filters/filters';
import {
  getContextualFiltersForActiveFilters,
  countMatchingEntities,
  type ContextualFilter,
} from './contextual-filters';
import type { ContextualFilterState } from './contextual-filter-state';
import type { EntityData } from '@entity';
import WideFileMd from '@macro-icons/wide/file-md.svg';
import WideTask from '@macro-icons/wide/task.svg';
import WideEmail from '@macro-icons/wide/email.svg';
import WideChat from '@macro-icons/wide/chat.svg';
import WideStar from '@macro-icons/wide/star.svg';
import WideFolder from '@macro-icons/wide/folder.svg';
import { useUserId } from '@core/context/user';
import { Popover } from '@kobalte/core/popover';
import ChevronDownIcon from '@icon/regular/caret-down.svg';
import CheckIcon from '@icon/bold/check-bold.svg';

/**
 * Status filter options
 */
const STATUS_FILTER_OPTIONS: FilterOption[] = [
  { id: 'unread', label: 'Unread' },
  { id: 'not-done', label: 'Not Done' },
];

/**
 * Type filter options with icons
 */
const TYPE_FILTER_OPTIONS: FilterOption[] = [
  { id: 'document', label: 'Docs', icon: WideFileMd },
  { id: 'task', label: 'Tasks', icon: WideTask },
  { id: 'email', label: 'Mail', icon: WideEmail },
  { id: 'people', label: 'People', icon: WideChat },
  { id: 'teams', label: 'Teams', icon: WideChat },
  { id: 'agent', label: 'Agents', icon: WideStar },
  { id: 'file', label: 'Files', icon: WideFolder },
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
 * Toolbar with filter dropdown checkboxes for the soup view.
 * Provides quick access to type, status, and contextual filters grouped by category.
 */
export const SoupFilterToolbar: Component<SoupFilterToolbarProps> = (props) => {
  const soup = useSoup();
  const userId = useUserId();

  const handleToggle = (filterId: FilterID) => {
    soup.filters.toggle(filterId);
  };

  // Get contextual filters based on active main filters
  const contextualFilters = createMemo(() => {
    const activeIds = soup.filters.activeIds() as FilterID[];
    const currentUserId = userId();
    return getContextualFiltersForActiveFilters(activeIds, currentUserId);
  });

  // Calculate counts for contextual filters
  // Uses filtered entities to show accurate counts after other filters are applied
  const contextualFilterCounts = createMemo(() => {
    // Use filtered entities if available, otherwise fall back to original entities
    // This ensures counts reflect what's currently visible in the list
    const entities =
      props.filteredEntities ?? props.entities ?? (soup.data() as EntityData[]);
    const counts = new Map<string, number>();

    for (const filter of contextualFilters()) {
      // Count how many items in the current filtered set match this filter
      counts.set(filter.id, countMatchingEntities(entities, filter));
    }
    return counts;
  });

  // Group contextual filters by category, filtering out those with zero matches
  const groupedContextualFilters = createMemo(() => {
    const counts = contextualFilterCounts();
    const filters = contextualFilters().filter(
      (f) => (counts.get(f.id) ?? 0) > 0
    );

    // Group by category
    const groups = new Map<string, ContextualFilter[]>();
    for (const filter of filters) {
      const category = filter.category ?? 'other';
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(filter);
    }

    // Sort groups by predefined order
    const sortedGroups: Array<{ category: string; filters: ContextualFilter[] }> =
      [];
    for (const category of CATEGORY_ORDER) {
      const categoryFilters = groups.get(category);
      if (categoryFilters && categoryFilters.length > 0) {
        sortedGroups.push({ category, filters: categoryFilters });
      }
    }

    // Add any remaining categories not in the predefined order
    for (const [category, categoryFilters] of groups) {
      if (!CATEGORY_ORDER.includes(category) && categoryFilters.length > 0) {
        sortedGroups.push({ category, filters: categoryFilters });
      }
    }

    return sortedGroups;
  });

  const clearAllFilters = () => {
    soup.filters.clear();
    props.contextualFilterState.clear();
  };

  const totalActiveFilters = createMemo(() => {
    return (
      soup.filters.activeIds().length +
      props.contextualFilterState.activeIds().size
    );
  });

  // Check if any contextual filter in a group is active
  const hasActiveInGroup = (filters: ContextualFilter[]) => {
    return filters.some((f) => props.contextualFilterState.isActive(f.id));
  };

  // Count active filters in a group
  const activeCountInGroup = (filters: ContextualFilter[]) => {
    return filters.filter((f) => props.contextualFilterState.isActive(f.id))
      .length;
  };

  return (
    <div class={`border-b border-edge-muted ${props.class ?? ''}`}>
      {/* Main filter row */}
      <div class="flex items-center gap-1.5 px-2 py-1.5 overflow-x-auto">
        {/* Type filters dropdown */}
        <FilterDropdown
          label="Type"
          options={TYPE_FILTER_OPTIONS}
          activeFilters={soup.filters.activeIds}
          onToggle={handleToggle}
          shortcut="t"
        />

        {/* Divider */}
        <div class="w-px h-4 bg-edge-muted shrink-0" />

        {/* Status filters dropdown */}
        <FilterDropdown
          label="Status"
          options={STATUS_FILTER_OPTIONS}
          activeFilters={soup.filters.activeIds}
          onToggle={handleToggle}
          shortcut="s"
        />

        {/* Contextual filter dropdowns by category */}
        <For each={groupedContextualFilters()}>
          {(group) => (
            <>
              <div class="w-px h-4 bg-edge-muted shrink-0" />
              <ContextualFilterDropdown
                label={CATEGORY_LABELS[group.category] ?? group.category}
                filters={group.filters}
                counts={contextualFilterCounts()}
                contextualFilterState={props.contextualFilterState}
                hasActive={hasActiveInGroup(group.filters)}
                activeCount={activeCountInGroup(group.filters)}
              />
            </>
          )}
        </For>

        {/* Active filter count and clear button */}
        <div class="ml-auto text-xs text-ink-muted shrink-0">
          <Show when={totalActiveFilters() > 0}>
            <button
              type="button"
              class="hover:text-accent transition-colors"
              onClick={clearAllFilters}
            >
              Clear ({totalActiveFilters()})
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

interface ContextualFilterDropdownProps {
  label: string;
  filters: ContextualFilter[];
  counts: Map<string, number>;
  contextualFilterState: ContextualFilterState;
  hasActive: boolean;
  activeCount: number;
}

/**
 * Dropdown for contextual filters in a category
 */
const ContextualFilterDropdown: Component<ContextualFilterDropdownProps> = (
  props
) => {
  return (
    <Popover placement="bottom-start" gutter={4}>
      <Popover.Trigger
        as="button"
        type="button"
        class="flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
        classList={{
          'bg-accent/10 text-accent': props.hasActive,
          'text-ink-muted hover:text-ink hover:bg-hover': !props.hasActive,
        }}
      >
        <span>{props.label}</span>
        <Show when={props.activeCount > 0}>
          <span class="bg-accent text-panel text-[10px] px-1 rounded-full">
            {props.activeCount}
          </span>
        </Show>
        <ChevronDownIcon class="size-3 opacity-50" />
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content class="z-50 py-1 bg-panel border border-edge-muted rounded-lg shadow-lg min-w-[160px]">
          <For each={props.filters}>
            {(filter) => {
              const count = () => props.counts.get(filter.id) ?? 0;
              const isActive = () =>
                props.contextualFilterState.isActive(filter.id);

              return (
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors"
                  classList={{
                    'bg-accent/10 text-accent': isActive(),
                    'text-ink hover:bg-hover': !isActive(),
                  }}
                  onClick={() => props.contextualFilterState.toggle(filter)}
                >
                  {/* Checkbox indicator */}
                  <div
                    class="size-4 rounded border flex items-center justify-center shrink-0"
                    classList={{
                      'border-accent bg-accent': isActive(),
                      'border-edge': !isActive(),
                    }}
                  >
                    <Show when={isActive()}>
                      <CheckIcon class="size-3 text-panel" />
                    </Show>
                  </div>

                  <span class="flex-1 truncate">{filter.label}</span>
                  <span class="text-ink-muted text-xs">{count()}</span>
                </button>
              );
            }}
          </For>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
};

export default SoupFilterToolbar;
