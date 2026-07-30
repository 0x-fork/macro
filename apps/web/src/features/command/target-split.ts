import { isListViewID } from '@app/constants/list-views';
import { globalSplitManager } from '@app/signal/splitLayout';
import type { SplitHandle } from '@components/app/split-layout/layoutManager';

/**
 * Where a command-menu action (opening an entity, creating a block) should
 * land when a list panel is on screen: the active Preview Pair's Viewer, so
 * the list panel — the app's nav — keeps its state and the content opens
 * beside it. On a bare list view (no pair engaged) the preview pane is
 * engaged first so a right panel exists to land in. Returns undefined when
 * no list panel is involved — default replace/new split routing applies.
 *
 * Engaging the pair is a side effect: only call this when the result will
 * actually be navigated.
 */
export const createTargetSplit = (): SplitHandle | undefined => {
  const manager = globalSplitManager();
  const active = manager?.activeSplit();
  if (!manager || !active) return undefined;

  const viewerId = manager.viewerOf(active.id);
  if (viewerId) return manager.getSplit(viewerId);
  // Acting from a focused Viewer replaces the Viewer itself.
  if (manager.controllerOf(active.id) !== undefined) return active;

  const content = active.content();
  if (
    content.type === 'component' &&
    isListViewID(content.id) &&
    active.canEngagePreview()
  ) {
    active.engagePreview();
    const engagedViewerId = manager.viewerOf(active.id);
    if (engagedViewerId) return manager.getSplit(engagedViewerId);
  }

  return undefined;
};
