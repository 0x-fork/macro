import type { SidebarState } from '@components/app/app-sidebar/sidebar';
import { setAllSidePanelsOpen } from '@components/app/side-panel/registry';
import {
  setSidebarState,
  sidebarState,
} from '@components/app/sidebarVisibility';
import { createSignal } from 'solid-js';

/**
 * Global "writer mode" state for markdown documents: an iA-Writer-style
 * distraction-free writing surface. Enabling it enters browser fullscreen,
 * collapses the app sidebar and every right side panel, hides the document
 * discussion and comments, disables spellcheck, and bumps the editor type
 * size. Disabling it restores the previous chrome.
 */
const [isFocusMode, setIsFocusMode] = createSignal(false);

export { isFocusMode };

/** Sidebar state captured on enter so exit can restore it. */
let previousSidebarState: SidebarState | undefined;

// Leaving fullscreen by any means (Esc, browser UI) also leaves focus mode so
// the app chrome never stays hidden outside the fullscreen writing surface.
function handleFullscreenChange() {
  if (!document.fullscreenElement) setFocusMode(false);
}

// Focus mode strips every chrome control, so Esc must always be able to get
// out. When fullscreen is active the browser consumes Esc and
// `handleFullscreenChange` exits; this fallback covers the case where the
// fullscreen request was denied.
function handleEscapeFallback(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (document.fullscreenElement) return;
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
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('keydown', handleEscapeFallback);
    if (!document.fullscreenElement) {
      // Fullscreen can be denied (no user gesture, unsupported webview) —
      // focus mode still applies its in-app changes without it.
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } else {
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    document.removeEventListener('keydown', handleEscapeFallback);
    if (previousSidebarState !== undefined) {
      setSidebarState(previousSidebarState);
      previousSidebarState = undefined;
    }
    setAllSidePanelsOpen(true);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
}
