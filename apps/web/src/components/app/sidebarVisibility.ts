import { isMobile } from '@core/mobile/isMobile';
import { makePersisted } from '@solid-primitives/storage';
import { createContext, createSignal, useContext } from 'solid-js';
import type { SidebarState } from './app-sidebar/sidebar';

export const SidebarVisibilityContext = createContext<() => boolean>(
  () => false
);
export const isSidebarVisible = () => useContext(SidebarVisibilityContext)();

/**
 * Persisted expanded/slim/hidden state of the app sidebar. Module-scoped so
 * both `Layout` (which owns the sidebar) and global behaviors like the
 * markdown writer mode can read and drive it.
 */
export const [sidebarState, setSidebarState] = makePersisted(
  createSignal<SidebarState>(!isMobile() ? 'expanded' : 'hidden'),
  {
    name: 'sidebar-state',
  }
);

export type SidebarCollapseContextValue = {
  isCollapsed: () => boolean;
  expand: () => void;
};

export const SidebarCollapseContext =
  createContext<SidebarCollapseContextValue>({
    isCollapsed: () => false,
    expand: () => {},
  });

export const useSidebarCollapse = () => useContext(SidebarCollapseContext);
