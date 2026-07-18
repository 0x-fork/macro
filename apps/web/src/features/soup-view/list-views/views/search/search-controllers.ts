import type { FacetSelection } from '@app/features/soup-list';
import type { SplitId } from '@components/app/split-layout/layoutManager';

export type SoupSearchSplitController = {
  applyFacetOverrides: (overrides: {
    query: string;
    facets: FacetSelection;
  }) => void;
  focus: () => void;
};

const registry = new Map<SplitId, SoupSearchSplitController>();
const pendingFocusBySplit = new Set<SplitId>();

export function registerSoupSearchSplit(
  splitId: SplitId,
  controller: SoupSearchSplitController
): () => void {
  registry.set(splitId, controller);
  if (pendingFocusBySplit.delete(splitId)) controller.focus();

  return () => {
    if (registry.get(splitId) === controller) registry.delete(splitId);
  };
}

export function getSoupSearchSplit(splitId: SplitId) {
  return registry.get(splitId);
}

export function requestSoupSearchFocus(splitId: SplitId) {
  const controller = registry.get(splitId);
  if (controller) {
    controller.focus();
    return;
  }
  pendingFocusBySplit.add(splitId);
}
