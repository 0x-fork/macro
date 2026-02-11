import {
  type Component,
  createContext,
  createMemo,
  createSignal,
  Show,
  useContext,
} from 'solid-js';
import { SoupSidebar } from './SoupSidebar';
import { SoupFilterToolbar } from './SoupFilterToolbar';
import { SoupViewList } from '@app/component/next-soup/soup-view/soup-view';
import {
  SoupViewContext,
  SoupViewContextProvider,
  useSoupView,
  type SoupRow,
} from '@app/component/next-soup/soup-view/soup-view-context';
import {
  useMaybeSoup,
  SoupContextProvider,
  useSoup,
} from '@app/component/next-soup/soup-context';
import { createSoupState } from '@app/component/next-soup/create-soup-state';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { SplitPanelContext } from '@app/component/split-layout/context';
import { SoupChatInput } from '@app/component/SoupChatInput';
import { ENABLE_UNIFIED_LIST_AI_INPUT } from '@core/constant/featureFlags';
import { isMobile } from '@core/mobile/isMobile';
import type { EntityData } from '@entity';
import { createContextualFilterState } from './contextual-filter-state';
import {
  getContextualFiltersForActiveFilters,
  ALL_CONTEXTUAL_FILTERS,
  createAssignedToMeFilter,
  type ContextualFilter,
} from './contextual-filters';
import type { FilterID } from '@app/component/next-soup/filters/filters';
import type { ContextualFilterState } from './contextual-filter-state';
import { useUserId } from '@core/context/user';
import type { PredefinedView } from './predefined-views';

/**
 * Context for passing contextual filter state to children
 */
const ContextualFilterContext = createContext<ContextualFilterState>();

export const useContextualFilters = () => useContext(ContextualFilterContext);

/**
 * Main component that combines the sidebar, filter toolbar, and soup list.
 * This creates a Linear-inspired layout with:
 * - A collapsible sidebar on the left with predefined views
 * - Filter dropdowns above the list
 * - The main soup list in the center
 */
export const SoupWithSidebar: Component = () => {
  const existingSoup = useMaybeSoup();

  // Create soup state if not already provided by parent context
  const soup =
    existingSoup ??
    createSoupState({
      initialFilters: ['explicit-noise'],
    });

  const panel = useSplitPanelOrThrow();

  return (
    <SoupContextProvider soup={soup}>
      <SplitPanelContext.Provider
        value={{
          ...panel,
          halfSplitState: () =>
            soup.previewEntity() ? { side: 'left', percentage: 30 } : undefined,
        }}
      >
        <SoupViewContextProvider soup={soup}>
          <SoupWithSidebarInner />
        </SoupViewContextProvider>
      </SplitPanelContext.Provider>
    </SoupContextProvider>
  );
};

/**
 * Inner component that has access to soup view context
 */
const SoupWithSidebarInner: Component = () => {
  const soupViewContext = useSoupView();
  const { rows } = soupViewContext;
  const soup = useSoup();
  const [sidebarPinned, setSidebarPinned] = createSignal(false);

  // Get current user ID for user-specific filters like "Assigned to Me"
  const userId = useUserId();

  // Get entities from rows for contextual filtering (before contextual filters)
  const entities = createMemo(() => rows().map((r) => r.original as EntityData));

  // Get available contextual filters based on active main filters
  // Pass currentUserId to enable user-specific filters
  const availableContextualFilters = createMemo(() => {
    const activeIds = soup.filters.activeIds() as FilterID[];
    const currentUserId = userId();
    return getContextualFiltersForActiveFilters(activeIds, currentUserId);
  });

  // Create contextual filter state
  const contextualFilterState = createContextualFilterState(availableContextualFilters);

  // Handle view selection - activate contextual filters specified by the view
  const handleViewSelect = (view: PredefinedView) => {
    // Clear existing contextual filters
    contextualFilterState.clear();

    // Activate contextual filters from the view
    if (view.contextualFilters) {
      const currentUserId = userId();
      for (const filterId of view.contextualFilters) {
        // Find the filter by ID
        let filter: ContextualFilter | undefined;

        // Special case for "assigned to me" which needs current user
        if (filterId === 'task-assigned-to-me' && currentUserId) {
          filter = createAssignedToMeFilter(currentUserId);
        } else {
          filter = ALL_CONTEXTUAL_FILTERS.find((f) => f.id === filterId);
        }

        if (filter) {
          contextualFilterState.toggle(filter);
        }
      }
    }
  };

  // Apply contextual filters to get filtered rows
  const filteredRows = createMemo((): SoupRow[] => {
    const allRows = rows();
    const activeFilters = contextualFilterState.activeFilters();

    if (activeFilters.length === 0) {
      return allRows;
    }

    // Filter rows based on active contextual filters
    return allRows.filter((row) =>
      activeFilters.every((filter) =>
        filter.predicate(row.original as EntityData)
      )
    );
  });

  // Get filtered entities (after contextual filters) for accurate counts
  // Must be defined after filteredRows
  const filteredEntities = createMemo(() =>
    filteredRows().map((r) => r.original as EntityData)
  );

  // Create a modified context that provides filtered rows
  const filteredSoupViewContext = createMemo(() => ({
    ...soupViewContext,
    rows: filteredRows,
  }));

  return (
    <div class="relative flex size-full">
      {/* Sidebar - only show on non-mobile */}
      <Show when={!isMobile()}>
        <SoupSidebar
          pinned={sidebarPinned()}
          onPinnedChange={setSidebarPinned}
          onViewSelect={handleViewSelect}
        />
      </Show>

      {/* Main content area */}
      <div class="flex-1 flex flex-col min-w-0">
        {/* Filter toolbar with dropdowns and contextual filters */}
        <SoupFilterToolbar
          entities={entities()}
          filteredEntities={filteredEntities()}
          contextualFilterState={contextualFilterState}
        />

        {/* Soup list with filtered rows context */}
        <div class="flex-1 min-h-0">
          <SoupViewContext.Provider value={filteredSoupViewContext()}>
            <SoupViewList />
          </SoupViewContext.Provider>
        </div>

        {/* AI input if enabled */}
        <Show when={ENABLE_UNIFIED_LIST_AI_INPUT && !isMobile()}>
          <SoupChatInput />
        </Show>
      </div>
    </div>
  );
};

export default SoupWithSidebar;
