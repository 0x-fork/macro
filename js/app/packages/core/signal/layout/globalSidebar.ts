import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';

export const GLOBAL_SIDEBAR_PANEL_ID = 'global-sidebar-panel';
const GLOBAL_SIDEBAR_COMPACT_BREAKPOINT_PX = 200;
const DEFAULT_GLOBAL_SIDEBAR_WIDTH = 100;

export type SidebarViewShortcutId =
  | 'message-inbox'
  | 'my-tasks'
  | 'team-tasks';

export type SidebarPinnedItem =
  | {
      kind: 'view';
      id: SidebarViewShortcutId;
      label: string;
    }
  | {
      kind: 'entity';
      entityId: string;
      entityType: string;
      splitType: string;
      label?: string;
    };

const DEFAULT_PINNED_ITEMS: SidebarPinnedItem[] = [
  { kind: 'view', id: 'message-inbox', label: 'Message Inbox' },
  { kind: 'view', id: 'my-tasks', label: 'My Tasks' },
  { kind: 'view', id: 'team-tasks', label: 'Team Tasks' },
];

export const [isGlobalSidebarCollapsed, setIsGlobalSidebarCollapsed] =
  makePersisted(createSignal(false), {
    name: 'global-sidebar-collapsed',
  });

export const [storedGlobalSidebarWidth, setStoredGlobalSidebarWidth] =
  makePersisted(createSignal(DEFAULT_GLOBAL_SIDEBAR_WIDTH), {
    name: 'global-sidebar-width',
  });

export const [sidebarPinnedItems, setSidebarPinnedItems] = makePersisted(
  createSignal<SidebarPinnedItem[]>(DEFAULT_PINNED_ITEMS),
  {
    name: 'global-sidebar-pins',
  }
);

export const isGlobalSidebarCompact = () =>
  storedGlobalSidebarWidth() < GLOBAL_SIDEBAR_COMPACT_BREAKPOINT_PX;

export function isEntityPinned(entityId: string) {
  return sidebarPinnedItems().some(
    (item) => item.kind === 'entity' && item.entityId === entityId
  );
}

export function pinEntityInSidebar(params: {
  entityId: string;
  entityType: string;
  splitType: string;
  label?: string;
}) {
  if (isEntityPinned(params.entityId)) return;
  setSidebarPinnedItems((prev) => [
    ...prev,
    {
      kind: 'entity',
      entityId: params.entityId,
      entityType: params.entityType,
      splitType: params.splitType,
      label: params.label,
    },
  ]);
}

export function unpinEntityInSidebar(entityId: string) {
  setSidebarPinnedItems((prev) =>
    prev.filter((item) => !(item.kind === 'entity' && item.entityId === entityId))
  );
}

export function getPinnedItemByShortcutIndex(index: number) {
  if (index < 1) return undefined;
  return sidebarPinnedItems()[index - 1];
}
