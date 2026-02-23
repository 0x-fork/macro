import type { SidebarPinnedItem, SidebarViewShortcutId } from '@core/signal/layout/globalSidebar';
import { globalSplitManager } from '@app/signal/splitLayout';
import type { SidebarPresetViewId } from '@app/component/next-soup/sidebar/viewPresets';
import type { SplitHandle } from '@app/component/split-layout/layoutManager';

export const VIEW_SHORTCUT_LABELS: Record<SidebarViewShortcutId, string> = {
  'message-inbox': 'Message Inbox',
  'my-tasks': 'My Tasks',
  'team-tasks': 'Team Tasks',
};

export const VIEW_SHORTCUT_TO_VIEW_ID: Record<
  SidebarViewShortcutId,
  SidebarPresetViewId
> = {
  'message-inbox': 'sidebar-message-inbox',
  'my-tasks': 'sidebar-my-tasks',
  'team-tasks': 'sidebar-team-tasks',
};

export function getActiveSplitHandle() {
  const manager = globalSplitManager();
  if (!manager) return;
  const activeSplitId = manager.activeSplitId();
  if (!activeSplitId) return;
  return manager.getSplit(activeSplitId);
}

function openViewShortcut(
  viewShortcutId: SidebarViewShortcutId,
  splitHandle: SplitHandle
) {
  const content = splitHandle.content();
  if (!(content.type === 'component' && content.id === 'unified-list')) {
    splitHandle.replace({
      next: { type: 'component', id: 'unified-list' },
      referredFrom: 'unified-list',
    });
  }

  splitHandle.updateMeta?.({ viewId: VIEW_SHORTCUT_TO_VIEW_ID[viewShortcutId] });
  splitHandle.activate();
}

function openPinnedEntity(item: Extract<SidebarPinnedItem, { kind: 'entity' }>) {
  const manager = globalSplitManager();
  const splitHandle = getActiveSplitHandle();
  if (!manager || !splitHandle) return;

  manager.openWithSplit(
    { type: item.splitType as never, id: item.entityId },
    { handle: splitHandle, referredFrom: 'unified-list', activate: true }
  );
}

export function openSidebarPinnedItem(item: SidebarPinnedItem) {
  const splitHandle = getActiveSplitHandle();
  if (!splitHandle) return;

  if (item.kind === 'view') {
    openViewShortcut(item.id, splitHandle);
    return;
  }

  openPinnedEntity(item);
}
