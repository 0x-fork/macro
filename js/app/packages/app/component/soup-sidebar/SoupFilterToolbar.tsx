import { type Component, createEffect, createMemo, createSignal, For, Show, type Accessor, type JSX } from 'solid-js';
import { Dynamic, Portal } from 'solid-js/web';
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
import { useUserId, useEmail } from '@core/context/user';
import { Popover } from '@kobalte/core/popover';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import ChevronDownIcon from '@icon/regular/caret-down.svg';
import CheckIcon from '@icon/bold/check-bold.svg';
import XIcon from '@icon/regular/x.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import FilterIcon from '@macro-icons/pixel/tag.svg';
import WideFileMd from '@macro-icons/wide/file-md.svg';
import WideTask from '@macro-icons/wide/task.svg';
import WideEmail from '@macro-icons/wide/email.svg';
import WideUser from '@macro-icons/wide/user.svg';
import WideChat from '@macro-icons/wide/chat.svg';
import WideStar from '@macro-icons/wide/star.svg';
import WideFolder from '@macro-icons/wide/folder.svg';
import WideSignal from '@macro-icons/wide/signal.svg';
import WideTaskNotDone from '@macro-icons/wide/task-not-done.svg';
import WideNoise from '@macro-icons/wide/noise.svg';

/**
 * Type filters shown as pills
 */
const TYPE_FILTERS: Array<{ id: FilterID; label: string; icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>> }> = [
  { id: 'document', label: 'Docs', icon: WideFileMd },
  { id: 'task', label: 'Tasks', icon: WideTask },
  { id: 'email', label: 'Mail', icon: WideEmail },
  { id: 'people', label: 'People', icon: WideUser },
  { id: 'teams', label: 'Teams', icon: WideChat },
  { id: 'agent', label: 'Agents', icon: WideStar },
  { id: 'file', label: 'Files', icon: WideFolder },
];

/**
 * Status filters shown as pills
 */
const STATUS_FILTERS: Array<{ id: FilterID; label: string; icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>> }> = [
  { id: 'explicit-noise', label: 'Hide Noise', icon: WideNoise },
  { id: 'unread', label: 'Unread', icon: WideSignal },
  { id: 'not-done', label: 'Not Done', icon: WideTaskNotDone },
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

/**
 * Quick filter group configuration
 */
interface QuickFilterGroup {
  id: string;
  label: string;
  /** Filter IDs in this group - only one can be active at a time (segmented control) */
  filterIds: string[];
  /** If true, allows selecting none (toggleable). If false, one must always be selected */
  allowNone?: boolean;
}

/**
 * Quick filter groups for different entity types
 */
const EMAIL_QUICK_FILTERS: QuickFilterGroup[] = [
  {
    id: 'email-status',
    label: 'Status',
    filterIds: ['email-unread', 'email-read', 'email-sent-by-me', 'email-draft'],
    allowNone: true,
  },
];

const TASK_QUICK_FILTERS: QuickFilterGroup[] = [
  {
    id: 'task-status',
    label: 'Status',
    filterIds: ['task-open', 'task-in-progress', 'task-completed'],
    allowNone: true,
  },
];

export interface SoupFilterToolbarProps {
  /** Additional class names */
  class?: string;
  /** Original entities before contextual filtering */
  entities?: EntityData[];
  /** Entities after applying active contextual filters (for accurate counts) */
  filteredEntities?: EntityData[];
  /** Contextual filter state */
  contextualFilterState: ContextualFilterState;
  /** Active main filter IDs for quick filters */
  activeFilterIds?: FilterID[];
  /** Available contextual filters for quick filters */
  availableContextualFilters?: ContextualFilter[];
}

/**
 * Toolbar with search bar and combined filter dropdown.
 * Search on left, filter button on right - like Linear's display options.
 */
export const SoupFilterToolbar: Component<SoupFilterToolbarProps> = (props) => {
  const soup = useSoup();
  const userId = useUserId();
  const userEmail = useEmail();
  const { setSearchText } = useSoupView();
  
  // Local input value (what the user sees in the input)
  const [inputValue, setInputValue] = createSignal('');

  // Get contextual filters based on active main filters
  const contextualFilters = createMemo(() => {
    const activeIds = soup.filters.activeIds() as FilterID[];
    const currentUserId = userId();
    const currentUserEmail = userEmail();
    return getContextualFiltersForActiveFilters(activeIds, currentUserId, currentUserEmail);
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

  // Combined list of all active filters for display as pills
  type ActiveFilterPill = {
    id: string;
    label: string;
    type: 'main' | 'contextual';
    remove: () => void;
  };

  const activeFilterPills = createMemo((): ActiveFilterPill[] => {
    const pills: ActiveFilterPill[] = [];

    // Add main filters (type and status)
    for (const filterId of soup.filters.activeIds()) {
      const typeFilter = TYPE_FILTERS.find((f) => f.id === filterId);
      if (typeFilter) {
        pills.push({
          id: filterId,
          label: typeFilter.label,
          type: 'main',
          remove: () => soup.filters.toggle(filterId),
        });
        continue;
      }
      const statusFilter = STATUS_FILTERS.find((f) => f.id === filterId);
      if (statusFilter) {
        pills.push({
          id: filterId,
          label: statusFilter.label,
          type: 'main',
          remove: () => soup.filters.toggle(filterId),
        });
      }
    }

    // Add contextual filters
    for (const filter of props.contextualFilterState.activeFilters()) {
      pills.push({
        id: filter.id,
        label: filter.label,
        type: 'contextual',
        remove: () => props.contextualFilterState.toggle(filter),
      });
    }

    return pills;
  });

  const clearAllFilters = () => {
    soup.filters.clear();
    props.contextualFilterState.clear();
  };

  // Track input ref for cursor position and autocomplete positioning
  let inputRef: HTMLInputElement | undefined;
  let containerRef: HTMLDivElement | undefined;
  let dropdownRef: HTMLDivElement | undefined;
  
  // Autocomplete state
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);
  const [showAutocomplete, setShowAutocomplete] = createSignal(false);
  const [dropdownPosition, setDropdownPosition] = createSignal({ top: 0, left: 0 });
  
  // Scroll highlighted item into view
  const scrollHighlightedIntoView = (index: number) => {
    if (!dropdownRef) return;
    const items = dropdownRef.querySelectorAll('button');
    const item = items[index];
    if (item) {
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  };

  // Available filter suggestions (filters that are not yet active)
  type FilterSuggestion = {
    id: string;
    label: string;
    category: string;
    /** Entity type this filter applies to (for disambiguation) */
    entityType?: string;
    type: 'main' | 'contextual';
    activate: () => void;
  };

  // Map entity type prefixes to readable names
  const ENTITY_TYPE_LABELS: Record<string, string> = {
    email: 'Email',
    task: 'Task',
    document: 'Doc',
    channel: 'Channel',
    chat: 'Agent',
  };

  const availableFilterSuggestions = createMemo((): FilterSuggestion[] => {
    const suggestions: FilterSuggestion[] = [];
    const activeMainIds = new Set(soup.filters.activeIds());
    const activeContextualIds = props.contextualFilterState.activeIds();

    // Add type filters that aren't active
    for (const filter of TYPE_FILTERS) {
      if (!activeMainIds.has(filter.id)) {
        suggestions.push({
          id: filter.id,
          label: filter.label,
          category: 'Type',
          type: 'main',
          activate: () => soup.filters.toggle(filter.id),
        });
      }
    }

    // Add status filters that aren't active
    for (const filter of STATUS_FILTERS) {
      if (!activeMainIds.has(filter.id)) {
        suggestions.push({
          id: filter.id,
          label: filter.label,
          category: 'Status',
          type: 'main',
          activate: () => soup.filters.toggle(filter.id),
        });
      }
    }

    // Add contextual filters that aren't active
    // Track seen labels to detect duplicates
    const seenLabels = new Map<string, number>();
    const contextualSuggestions: FilterSuggestion[] = [];
    
    for (const filter of contextualFilters()) {
      if (!activeContextualIds.has(filter.id)) {
        const category = CATEGORY_LABELS[filter.category ?? 'other'] ?? filter.category ?? 'Other';
        // Extract entity type from filter id (e.g., 'email-unread' -> 'email')
        const entityType = filter.appliesTo?.[0];
        
        contextualSuggestions.push({
          id: filter.id,
          label: filter.label,
          category,
          entityType,
          type: 'contextual',
          activate: () => props.contextualFilterState.toggle(filter),
        });
        
        // Count occurrences of this label
        const count = seenLabels.get(filter.label) ?? 0;
        seenLabels.set(filter.label, count + 1);
      }
    }
    
    // For labels that appear multiple times, prefix with entity type
    for (const suggestion of contextualSuggestions) {
      if ((seenLabels.get(suggestion.label) ?? 0) > 1 && suggestion.entityType) {
        const entityLabel = ENTITY_TYPE_LABELS[suggestion.entityType] ?? suggestion.entityType;
        suggestion.label = `${entityLabel}: ${suggestion.label}`;
      }
    }
    
    suggestions.push(...contextualSuggestions);

    return suggestions;
  });

  // Check if we're in filter mode (started with @)
  const FILTER_TRIGGER = '@';
  
  // Parse the input to find filter query (text after @ without a trailing space)
  const filterQuery = createMemo(() => {
    const text = inputValue();
    const triggerIndex = text.lastIndexOf(FILTER_TRIGGER);
    if (triggerIndex === -1) return null;
    
    const afterTrigger = text.slice(triggerIndex + 1);
    // If there's a space after the @query, it's not an active filter query
    if (afterTrigger.includes(' ')) return null;
    
    return afterTrigger.toLowerCase();
  });

  // Compute the effective search text (excluding active @query)
  const effectiveSearchText = createMemo(() => {
    const text = inputValue();
    const triggerIndex = text.lastIndexOf(FILTER_TRIGGER);
    
    // No @ trigger, use full text
    if (triggerIndex === -1) return text;
    
    const afterTrigger = text.slice(triggerIndex + 1);
    // If there's a space after @query, the @query is "committed" as literal text
    if (afterTrigger.includes(' ')) return text;
    
    // Otherwise, exclude the @query part from search
    return text.slice(0, triggerIndex).trim();
  });

  // Sync effective search text to soup view
  createEffect(() => {
    setSearchText(effectiveSearchText());
  });

  // Filter suggestions based on query after @
  const filteredSuggestions = createMemo(() => {
    const query = filterQuery();
    if (query === null) return [];
    
    // If just @ with no query, show all available filters
    if (query === '') {
      return availableFilterSuggestions();
    }
    
    return availableFilterSuggestions().filter((s) =>
      s.label.toLowerCase().includes(query) ||
      s.category.toLowerCase().includes(query)
    );
  });

  // Reset highlighted index when suggestions change
  createEffect(() => {
    const suggestions = filteredSuggestions();
    if (suggestions.length > 0) {
      setHighlightedIndex(0);
      setShowAutocomplete(true);
      updateDropdownPosition();
    } else {
      setShowAutocomplete(false);
    }
  });

  // Update dropdown position based on input location
  const updateDropdownPosition = () => {
    if (inputRef) {
      const rect = inputRef.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  };

  const selectSuggestion = (suggestion: FilterSuggestion) => {
    suggestion.activate();
    // Remove the @query part from input, keep any text before @
    const text = inputValue();
    const triggerIndex = text.lastIndexOf(FILTER_TRIGGER);
    if (triggerIndex !== -1) {
      setInputValue(text.slice(0, triggerIndex).trimEnd());
    } else {
      setInputValue('');
    }
    setShowAutocomplete(false);
    inputRef?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const suggestions = filteredSuggestions();
    
    // Arrow navigation in autocomplete
    if (showAutocomplete() && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newIndex = Math.min(highlightedIndex() + 1, suggestions.length - 1);
        setHighlightedIndex(newIndex);
        scrollHighlightedIntoView(newIndex);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newIndex = Math.max(highlightedIndex() - 1, 0);
        setHighlightedIndex(newIndex);
        scrollHighlightedIntoView(newIndex);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = suggestions[highlightedIndex()];
        if (selected) {
          selectSuggestion(selected);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowAutocomplete(false);
        return;
      }
    }

    // Backspace to remove last pill
    if (
      e.key === 'Backspace' &&
      inputRef &&
      inputRef.selectionStart === 0 &&
      inputRef.selectionEnd === 0 &&
      activeFilterPills().length > 0
    ) {
      const pills = activeFilterPills();
      const lastPill = pills[pills.length - 1];
      lastPill.remove();
      e.preventDefault();
    }
  };

  const handleInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    setInputValue(e.currentTarget.value);
    updateDropdownPosition();
  };

  const handleFocus = () => {
    updateDropdownPosition();
    if (filteredSuggestions().length > 0) {
      setShowAutocomplete(true);
    }
  };

  const handleBlur = () => {
    // Delay hiding to allow click on suggestion
    setTimeout(() => setShowAutocomplete(false), 150);
  };

  // Quick filter groups based on active main filters
  const quickFilterGroups = createMemo(() => {
    const groups: QuickFilterGroup[] = [];
    const activeIds = props.activeFilterIds ?? (soup.filters.activeIds() as FilterID[]);
    
    const hasEmail = activeIds.includes('email');
    const hasTask = activeIds.includes('task');
    
    if (hasEmail) {
      groups.push(...EMAIL_QUICK_FILTERS);
    }
    if (hasTask) {
      groups.push(...TASK_QUICK_FILTERS);
    }
    
    return groups;
  });

  // Handle clicking a quick filter segment
  const handleQuickFilterClick = (filterId: string, group: QuickFilterGroup) => {
    const filter = contextualFilters().find(f => f.id === filterId);
    if (!filter) return;
    
    const isCurrentlyActive = props.contextualFilterState.isActive(filterId);
    
    // If clicking on already active filter and allowNone, deactivate it
    if (isCurrentlyActive && group.allowNone) {
      props.contextualFilterState.toggle(filter);
      return;
    }
    
    // Deactivate other filters in this group first
    for (const id of group.filterIds) {
      if (props.contextualFilterState.isActive(id) && id !== filterId) {
        const otherFilter = contextualFilters().find(f => f.id === id);
        if (otherFilter) {
          props.contextualFilterState.toggle(otherFilter);
        }
      }
    }
    
    // Activate the clicked filter if not already active
    if (!isCurrentlyActive) {
      props.contextualFilterState.toggle(filter);
    }
  };

  return (
    <>
      {/* Quick filters and search bar in header left */}
      <SplitHeaderLeft>
        <div 
          ref={containerRef}
          class="flex items-center gap-2 h-full w-full min-w-0"
        >
          {/* Quick filter segments */}
          <For each={quickFilterGroups()}>
            {(group) => {
              // Get filters that exist in available contextual filters
              const groupFilters = () => group.filterIds
                .map(id => contextualFilters().find(f => f.id === id))
                .filter((f): f is ContextualFilter => f !== undefined);
              
              return (
                <Show when={groupFilters().length > 0}>
                  <div class="flex items-center rounded-md bg-ink/5 p-0.5 shrink-0">
                    <For each={groupFilters()}>
                      {(filter) => {
                        const isActive = () => props.contextualFilterState.isActive(filter.id);
                        return (
                          <button
                            type="button"
                            class="px-2 py-0.5 text-[11px] font-medium rounded transition-colors"
                            classList={{
                              'bg-panel text-ink shadow-sm': isActive(),
                              'text-ink-muted hover:text-ink': !isActive(),
                            }}
                            onClick={() => handleQuickFilterClick(filter.id, group)}
                          >
                            {filter.label}
                          </button>
                        );
                      }}
                    </For>
                  </div>
                </Show>
              );
            }}
          </For>
          
          {/* Spacer to push search to the right */}
          <div class="flex-1" />
          
          {/* Search section with icon and input */}
          <div class="flex items-center gap-1.5 min-w-0 w-[280px]">
            <SearchIcon class="size-3.5 text-ink-muted shrink-0" />
            
            {/* Active filter pills - temporarily hidden
            <For each={activeFilterPills()}>
              {(pill) => (
                <span class="flex items-center gap-1 px-1.5 py-0.5 text-[11px] bg-ink/10 text-ink-muted rounded shrink-0">
                  {pill.label}
                  <button
                    type="button"
                    class="hover:bg-ink/15 rounded-sm"
                    onClick={() => pill.remove()}
                  >
                    <XIcon class="size-3" />
                  </button>
                </span>
              )}
            </For>
            */}
            
            {/* Search input */}
            <input
              ref={inputRef}
              type="text"
              placeholder="Search..."
              value={inputValue()}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={handleFocus}
              onBlur={handleBlur}
              class="flex-1 min-w-0 bg-transparent text-xs text-ink placeholder:text-ink-muted outline-none"
            />
            <Show when={inputValue().length > 0}>
              <button
                type="button"
                class="text-ink-muted hover:text-ink text-xs shrink-0"
                onClick={() => setInputValue('')}
              >
                ×
              </button>
            </Show>
          </div>
        </div>
      </SplitHeaderLeft>

      {/* Filter dropdown button - on the right */}
      <SplitHeaderRight>
        <Popover placement="bottom-end" gutter={4}>
          <Popover.Trigger
            as="button"
            type="button"
            class="flex items-center gap-1.5 px-2 h-full text-xs transition-colors"
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
                          class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors"
                          classList={{
                            'bg-accent text-panel': isActive(),
                            'bg-panel-muted text-ink-muted hover:bg-ink/10 hover:text-ink': !isActive(),
                          }}
                          onClick={() => soup.filters.toggle(filter.id)}
                        >
                          <Dynamic component={filter.icon} class="size-3.5" />
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
                          class="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded transition-colors"
                          classList={{
                            'bg-accent text-panel': isActive(),
                            'bg-panel-muted text-ink-muted hover:bg-ink/10 hover:text-ink': !isActive(),
                          }}
                          onClick={() => soup.filters.toggle(filter.id)}
                        >
                          <Dynamic component={filter.icon} class="size-3.5" />
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
      </SplitHeaderRight>

      {/* Autocomplete dropdown - rendered via Portal to escape overflow clipping */}
      <Show when={showAutocomplete() && filteredSuggestions().length > 0}>
        <Portal>
          <div 
            ref={dropdownRef}
            class="fixed z-[100] bg-panel border border-edge-muted rounded-lg shadow-lg w-[280px] py-1 max-h-[300px] overflow-y-auto"
            style={{
              top: `${dropdownPosition().top}px`,
              left: `${dropdownPosition().left}px`,
            }}
          >
            <For each={filteredSuggestions()}>
              {(suggestion, index) => (
                <button
                  type="button"
                  class="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors"
                  classList={{
                    'bg-accent/10 text-ink': highlightedIndex() === index(),
                    'text-ink-muted hover:bg-ink/5': highlightedIndex() !== index(),
                  }}
                  onMouseEnter={() => setHighlightedIndex(index())}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  <span>{suggestion.label}</span>
                  <span class="text-[10px] text-ink-extra-muted">{suggestion.category}</span>
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </>
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
          <Popover.Content class="z-[60] bg-panel border border-edge-muted rounded-lg shadow-lg w-[200px] py-1">
            <For each={props.filters}>
              {(filter) => {
                const count = () => props.counts.get(filter.id) ?? 0;
                const isActive = () => props.contextualFilterState.isActive(filter.id);
                return (
                  <button
                    type="button"
                    class="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs hover:bg-ink/5 transition-colors"
                    classList={{
                      'text-ink': isActive(),
                      'text-ink-muted': !isActive(),
                    }}
                    onClick={() => props.contextualFilterState.toggle(filter)}
                  >
                    {/* Icon or checkmark */}
                    <span class="size-4 flex items-center justify-center shrink-0">
                      <Show when={isActive()} fallback={
                        <Show when={filter.icon}>
                          <Dynamic component={filter.icon} class="size-3.5 text-ink-muted" />
                        </Show>
                      }>
                        <CheckIcon class="size-3 text-accent" />
                      </Show>
                    </span>
                    <span class="flex-1">{filter.label}</span>
                    <span class="text-ink-extra-muted">{count()}</span>
                  </button>
                );
              }}
            </For>
          </Popover.Content>
        </Popover.Portal>
      </Popover>
    </div>
  );
};

export default SoupFilterToolbar;
