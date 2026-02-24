import {
  type Component,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
  useContext,
} from 'solid-js';
import { SoupFilterToolbar } from './SoupFilterToolbar';
import { QuickFiltersBar } from './QuickFiltersBar';
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
import { getContextualFiltersForActiveFilters } from './contextual-filters';
import type { FilterID } from '@app/component/next-soup/filters/filters';
import type { ContextualFilterState } from './contextual-filter-state';
import { useUserId } from '@core/context/user';
import { applyViewToSplit, setApplyViewToSplit, applyContextualFilters, setApplyContextualFilters, registerActiveView, unregisterActiveView } from './sidebar-selection-state';
import type { SplitId } from '@app/component/split-layout/layoutManager';
import type { PredefinedView } from './predefined-views';

/**
 * Context for passing contextual filter state to children
 */
const ContextualFilterContext = createContext<ContextualFilterState>();

export const useContextualFilters = () => useContext(ContextualFilterContext);

/**
 * Apply a predefined view's filters to the soup state
 */
function applyViewFilters(soup: ReturnType<typeof createSoupState>, view: PredefinedView) {
  // Clear existing filters
  soup.filters.clear();

  // Activate view filters
  for (const filterId of view.filters) {
    soup.filters.activate(filterId);
  }

  // Set sort if specified
  if (view.sort) {
    soup.sort.setAll([view.sort]);
  }
}

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
  const splitId = panel.handle.id as SplitId;
  
  // Track the current active view in this split
  const [, setCurrentViewId] = createSignal<string | undefined>(undefined);

  // Listen for view changes from the sidebar overlay
  createEffect(() => {
    const pending = applyViewToSplit();
    if (pending && pending.splitId === splitId) {
      applyViewFilters(soup, pending.view);
      setCurrentViewId(pending.view.id);
      registerActiveView(splitId, pending.view.id);
      
      // If the view has contextual filters, signal to apply them
      if (pending.view.contextualFilters && pending.view.contextualFilters.length > 0) {
        setApplyContextualFilters({
          splitId: pending.splitId,
          contextualFilterIds: pending.view.contextualFilters,
        });
      }
      
      // Clear the signal after applying
      setApplyViewToSplit(null);
    }
  });
  
  // Unregister view when component unmounts
  onCleanup(() => {
    unregisterActiveView(splitId);
  });

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
          <SoupWithSidebarInner splitId={splitId} />
        </SoupViewContextProvider>
      </SplitPanelContext.Provider>
    </SoupContextProvider>
  );
};

interface SoupWithSidebarInnerProps {
  splitId: string;
}

/**
 * Inner component that has access to soup view context
 */
const SoupWithSidebarInner: Component<SoupWithSidebarInnerProps> = (props) => {
  const soupViewContext = useSoupView();
  const { rows } = soupViewContext;
  const soup = useSoup();

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

  // Listen for contextual filter changes from sidebar view selection
  createEffect(() => {
    const pending = applyContextualFilters();
    if (pending && pending.splitId === props.splitId) {
      // Clear existing contextual filters
      contextualFilterState.clear();
      
      // Apply the new contextual filters
      const availableFilters = availableContextualFilters();
      for (const filterId of pending.contextualFilterIds) {
        const filter = availableFilters.find(f => f.id === filterId);
        if (filter) {
          contextualFilterState.toggle(filter);
        }
      }
      
      // Clear the signal
      setApplyContextualFilters(null);
    }
  });

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

  // Get active filter IDs for quick filters bar
  const activeFilterIds = createMemo(() => soup.filters.activeIds() as FilterID[]);

  return (
    <>
      {/* Search and filter controls in split header */}
      <SoupFilterToolbar
        entities={entities()}
        filteredEntities={filteredEntities()}
        contextualFilterState={contextualFilterState}
      />

      {/* Quick contextual filters bar */}
      <QuickFiltersBar
        activeFilterIds={activeFilterIds()}
        availableFilters={availableContextualFilters()}
        contextualFilterState={contextualFilterState}
      />

      {/* Main content area - size-full needed since parent isn't a flex container */}
      <div class="size-full flex flex-col min-w-0">
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
    </>
  );
};

export default SoupWithSidebar;
