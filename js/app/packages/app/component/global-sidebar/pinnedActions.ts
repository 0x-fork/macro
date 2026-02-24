import type { SidebarPinnedItem, SidebarViewShortcutId } from '@core/signal/layout/globalSidebar';
import { globalSplitManager } from '@app/signal/splitLayout';
import type { SidebarPresetViewId } from '@app/component/next-soup/sidebar/viewPresets';
import type { SplitHandle } from '@app/component/split-layout/layoutManager';

export const VIEW_SHORTCUT_LABELS: Record<SidebarViewShortcutId, string> = {
  home: 'Home',
  inbox: 'Inbox',
  sent: 'Sent',
  messages: 'Messages',
  'my-notes': 'My Notes',
  'message-inbox': 'Message Inbox',
  'my-tasks': 'My Tasks',
  'team-tasks': 'Team Tasks',
};

export const VIEW_SHORTCUT_TO_VIEW_ID: Record<
  SidebarViewShortcutId,
  SidebarPresetViewId
> = {
  home: 'sidebar-home',
  inbox: 'sidebar-inbox',
  sent: 'sidebar-sent',
  messages: 'sidebar-messages',
  'my-notes': 'sidebar-my-notes',
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

function openPinnedEntity(
  item: Extract<SidebarPinnedItem, { kind: 'entity' }>,
  splitHandle: SplitHandle
) {
  const manager = globalSplitManager();
  if (!manager) return;

  manager.openWithSplit(
    { type: item.splitType as never, id: item.entityId },
    { handle: splitHandle, referredFrom: 'unified-list', activate: true }
  );
}

export function openSidebarPinnedItem(
  item: SidebarPinnedItem,
  targetSplitHandle?: SplitHandle
) {
  const splitHandle = targetSplitHandle ?? getActiveSplitHandle();
  if (!splitHandle) return;

  if (item.kind === 'view') {
    openViewShortcut(item.id, splitHandle);
    return;
  }

  openPinnedEntity(item, splitHandle);
}
