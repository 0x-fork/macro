import type { SidebarState } from '@components/app/app-sidebar/sidebar';
import { setAllSidePanelsOpen } from '@components/app/side-panel/registry';
import {
  setSidebarState,
  sidebarState,
} from '@components/app/sidebarVisibility';
import { createSignal } from 'solid-js';

/**
 * Global "writer mode" state for markdown documents: an iA-Writer-style
 * distraction-free writing surface inside the current window. Enabling it
 * collapses the app sidebar and every right side panel, strips the split
 * chrome, hides the document discussion and comments, disables spellcheck,
 * and bumps the editor type size. Disabling it (or pressing Esc) restores
 * the previous chrome.
 */
const [isFocusMode, setIsFocusMode] = createSignal(false);

export { isFocusMode };

/** Sidebar state captured on enter so exit can restore it. */
let previousSidebarState: SidebarState | undefined;

// Focus mode strips every chrome control, so Esc must always be able to get
// out. Defer to anything that already handled the keypress (e.g. closing an
// open menu).
function handleEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  setFocusMode(false);
}

/** Enter or leave writer/focus mode, applying all its chrome side effects. */
export function setFocusMode(enabled: boolean) {
  if (enabled === isFocusMode()) return;
  setIsFocusMode(enabled);

  if (enabled) {
    previousSidebarState = sidebarState();
    // Fully hidden (not slim) — no hover-reveal rail while writing.
    setSidebarState('hidden');
    setAllSidePanelsOpen(false);
    document.addEventListener('keydown', handleEscape);
  } else {
    document.removeEventListener('keydown', handleEscape);
    if (previousSidebarState !== undefined) {
      setSidebarState(previousSidebarState);
      previousSidebarState = undefined;
    }
    setAllSidePanelsOpen(true);
  }
}
