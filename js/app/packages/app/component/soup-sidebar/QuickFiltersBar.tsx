import { type Component, For, Show, createMemo } from 'solid-js';
import type { ContextualFilter } from './contextual-filters';
import type { ContextualFilterState } from './contextual-filter-state';
import type { FilterID } from '@app/component/next-soup/filters/filters';
import { cn } from '@ui/utils/classname';

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
    filterIds: ['email-unread', 'email-read', 'email-draft'],
    allowNone: true,
  },
  {
    id: 'email-priority',
    label: 'Priority',
    filterIds: ['email-signal', 'email-noise'],
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
  {
    id: 'task-priority',
    label: 'Priority', 
    filterIds: ['task-high-or-urgent', 'task-medium-priority', 'task-low-priority'],
    allowNone: true,
  },
  {
    id: 'task-due',
    label: 'Due',
    filterIds: ['task-overdue', 'task-due-today', 'task-due-this-week'],
    allowNone: true,
  },
];

const CHANNEL_QUICK_FILTERS: QuickFilterGroup[] = [
  {
    id: 'channel-type',
    label: 'Type',
    filterIds: ['channel-direct', 'channel-group'],
    allowNone: true,
  },
];

export interface QuickFiltersBarProps {
  /** Active main filter IDs to determine which quick filters to show */
  activeFilterIds: FilterID[];
  /** Available contextual filters */
  availableFilters: ContextualFilter[];
  /** Contextual filter state for toggling */
  contextualFilterState: ContextualFilterState;
}

/**
 * Quick filters bar that shows segmented controls for common filters
 * based on the current entity type being viewed
 */
export const QuickFiltersBar: Component<QuickFiltersBarProps> = (props) => {
  // Determine which quick filter groups to show based on active filters
  const quickFilterGroups = createMemo(() => {
    const groups: QuickFilterGroup[] = [];
    
    const hasEmail = props.activeFilterIds.includes('email');
    const hasTask = props.activeFilterIds.includes('task');
    const hasChannel = props.activeFilterIds.includes('people') || 
                       props.activeFilterIds.includes('teams') ||
                       props.activeFilterIds.includes('teams-and-people');
    
    if (hasEmail) {
      groups.push(...EMAIL_QUICK_FILTERS);
    }
    if (hasTask) {
      groups.push(...TASK_QUICK_FILTERS);
    }
    if (hasChannel) {
      groups.push(...CHANNEL_QUICK_FILTERS);
    }
    
    return groups;
  });

  // Only show if we have quick filter groups
  const shouldShow = createMemo(() => quickFilterGroups().length > 0);

  return (
    <Show when={shouldShow()}>
      <div class="flex items-center gap-3 px-3 py-2 border-b border-edge-muted bg-panel">
        <For each={quickFilterGroups()}>
          {(group) => (
            <QuickFilterSegment
              group={group}
              availableFilters={props.availableFilters}
              contextualFilterState={props.contextualFilterState}
            />
          )}
        </For>
      </div>
    </Show>
  );
};

interface QuickFilterSegmentProps {
  group: QuickFilterGroup;
  availableFilters: ContextualFilter[];
  contextualFilterState: ContextualFilterState;
}

/**
 * Segmented control for a group of quick filters
 */
const QuickFilterSegment: Component<QuickFilterSegmentProps> = (props) => {
  // Get filters that exist in available filters
  const groupFilters = createMemo(() => {
    return props.group.filterIds
      .map(id => props.availableFilters.find(f => f.id === id))
      .filter((f): f is ContextualFilter => f !== undefined);
  });

  const handleFilterClick = (filter: ContextualFilter) => {
    const isCurrentlyActive = props.contextualFilterState.isActive(filter.id);
    
    // If clicking on already active filter and allowNone, deactivate it
    if (isCurrentlyActive && props.group.allowNone) {
      props.contextualFilterState.toggle(filter);
      return;
    }
    
    // Deactivate other filters in this group first
    for (const f of groupFilters()) {
      if (props.contextualFilterState.isActive(f.id) && f.id !== filter.id) {
        props.contextualFilterState.toggle(f);
      }
    }
    
    // Activate the clicked filter if not already active
    if (!isCurrentlyActive) {
      props.contextualFilterState.toggle(filter);
    }
  };

  return (
    <Show when={groupFilters().length > 0}>
      <div class="flex items-center">
        <div class="flex items-center rounded-md bg-ink/5 p-0.5">
          <For each={groupFilters()}>
            {(filter) => {
              const isActive = () => props.contextualFilterState.isActive(filter.id);
              return (
                <button
                  type="button"
                  class={cn(
                    'px-2.5 py-1 text-xs font-medium rounded transition-colors',
                    isActive()
                      ? 'bg-panel text-ink shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  )}
                  onClick={() => handleFilterClick(filter)}
                >
                  {filter.label}
                </button>
              );
            }}
          </For>
        </div>
      </div>
    </Show>
  );
};

export default QuickFiltersBar;
