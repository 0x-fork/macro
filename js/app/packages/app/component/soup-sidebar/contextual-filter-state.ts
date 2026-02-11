import { createSignal, createMemo, type Accessor } from 'solid-js';
import type { ContextualFilter } from './contextual-filters';
import type { EntityData } from '@entity';

/**
 * State for managing contextual filters
 */
export interface ContextualFilterState {
  /** Currently active contextual filter IDs */
  activeIds: Accessor<Set<string>>;
  /** Toggle a contextual filter on/off */
  toggle: (filter: ContextualFilter) => void;
  /** Check if a filter is active */
  isActive: (filterId: string) => boolean;
  /** Clear all contextual filters */
  clear: () => void;
  /** Get active filter predicates */
  activeFilters: Accessor<ContextualFilter[]>;
  /** Apply active filters to entities */
  applyFilters: (entities: EntityData[]) => EntityData[];
}

/**
 * Creates contextual filter state
 */
export function createContextualFilterState(
  availableFilters: Accessor<ContextualFilter[]>
): ContextualFilterState {
  const [activeIds, setActiveIds] = createSignal<Set<string>>(new Set());

  const toggle = (filter: ContextualFilter) => {
    setActiveIds((prev) => {
      const next = new Set(prev);
      if (next.has(filter.id)) {
        next.delete(filter.id);
      } else {
        next.add(filter.id);
      }
      return next;
    });
  };

  const isActive = (filterId: string) => {
    return activeIds().has(filterId);
  };

  const clear = () => {
    setActiveIds(new Set<string>());
  };

  const activeFilters = createMemo(() => {
    const ids = activeIds();
    return availableFilters().filter((f) => ids.has(f.id));
  });

  const applyFilters = (entities: EntityData[]): EntityData[] => {
    const filters = activeFilters();
    if (filters.length === 0) return entities;

    // Apply all active filters (AND logic - entity must match all)
    return entities.filter((entity) =>
      filters.every((filter) => filter.predicate(entity))
    );
  };

  return {
    activeIds,
    toggle,
    isActive,
    clear,
    activeFilters,
    applyFilters,
  };
}
