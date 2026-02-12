import { createSignal } from 'solid-js';
import type { PredefinedView } from './predefined-views';
import type { SplitId, SplitContent } from '@app/component/split-layout/layoutManager';

/**
 * Track which view is active in each split.
 * Map from splitId to viewId.
 */
const [activeViewsBySplit, setActiveViewsBySplit] = createSignal<Map<SplitId, string>>(new Map());

/**
 * Register a view as active in a split
 */
function registerActiveView(splitId: SplitId, viewId: string) {
  setActiveViewsBySplit(prev => {
    const next = new Map(prev);
    next.set(splitId, viewId);
    return next;
  });
}

/**
 * Unregister a view from a split (e.g., when split closes or changes to non-list content)
 */
function unregisterActiveView(splitId: SplitId) {
  setActiveViewsBySplit(prev => {
    const next = new Map(prev);
    next.delete(splitId);
    return next;
  });
}

/**
 * Get all split indices (1-indexed) where a view is active
 */
function getSplitIndicesForView(viewId: string, allSplitIds: SplitId[]): number[] {
  const activeViews = activeViewsBySplit();
  const indices: number[] = [];
  
  allSplitIds.forEach((splitId, index) => {
    if (activeViews.get(splitId) === viewId) {
      indices.push(index + 1); // 1-indexed
    }
  });
  
  return indices;
}

/**
 * Represents a pinned entity in the sidebar
 */
export interface PinnedItem {
  id: string;
  label: string;
  type: SplitContent['type'];
  entityId: string;
  icon?: string;
}

/**
 * Global state for sidebar view selection.
 * When a view is selected in the sidebar, this stores the pending view
 * so overlays can be shown on splits.
 */
const [pendingView, setPendingView] = createSignal<PredefinedView | null>(null);

/**
 * Global state for sidebar pinned item selection.
 * When a pinned item is selected, this stores the pending item
 * so overlays can be shown on splits.
 */
const [pendingPinnedItem, setPendingPinnedItem] = createSignal<PinnedItem | null>(null);

/**
 * Signal to apply a view to a specific split.
 * When set, the soup in that split should apply the view's filters.
 * Format: { splitId, view }
 */
const [applyViewToSplit, setApplyViewToSplit] = createSignal<{
  splitId: SplitId;
  view: PredefinedView;
} | null>(null);

/**
 * Signal to apply contextual filters after main filters are applied.
 * This is consumed by the inner soup component that has access to contextualFilterState.
 */
const [applyContextualFilters, setApplyContextualFilters] = createSignal<{
  splitId: SplitId;
  contextualFilterIds: readonly string[];
} | null>(null);

export { 
  pendingView, 
  setPendingView, 
  pendingPinnedItem,
  setPendingPinnedItem,
  applyViewToSplit, 
  setApplyViewToSplit,
  applyContextualFilters,
  setApplyContextualFilters,
  activeViewsBySplit,
  registerActiveView,
  unregisterActiveView,
  getSplitIndicesForView,
};
