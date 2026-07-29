import type { SplitId } from '@components/app/split-layout/layoutManager';

type ViewSwitcherController = {
  open: () => void;
};

const registry = new Map<SplitId, ViewSwitcherController>();
const pendingOpenBySplit = new Set<SplitId>();

export function registerViewSwitcher(
  splitId: SplitId,
  controller: ViewSwitcherController
): () => void {
  registry.set(splitId, controller);
  if (pendingOpenBySplit.delete(splitId)) {
    controller.open();
  }
  return () => {
    if (registry.get(splitId) === controller) registry.delete(splitId);
  };
}

/**
 * Open the view switcher dropdown in the given split. If the split's switcher
 * is already registered, open immediately; otherwise queue the request and
 * open once the switcher registers (e.g. after navigating to a list view).
 */
export function requestViewSwitcherOpen(splitId: SplitId) {
  const controller = registry.get(splitId);
  if (controller) {
    controller.open();
    return;
  }
  pendingOpenBySplit.add(splitId);
}
