import { setAllSidePanelsOpen } from '@components/app/side-panel/registry';
import { createSignal } from 'solid-js';

/**
 * Global "writer mode" state for markdown documents: an iA-Writer-style
 * distraction-free writing surface. Enabling it overlays the document block
 * over the whole window (see block-md `Block.tsx`) — covering the sidebar and
 * all split chrome without touching them — closes the right side panel,
 * hides the document discussion and comments, disables spellcheck, and bumps
 * the editor type size. Disabling it (or pressing Esc) restores everything.
 */
const [isFocusMode, setIsFocusMode] = createSignal(false);

export { isFocusMode };

// Focus mode strips every chrome control, so Esc must always be able to get
// out. Defer to anything that already handled the keypress (e.g. closing an
// open menu).
function handleEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  setFocusMode(false);
}

/** Enter or leave writer/focus mode, applying all its side effects. */
export function setFocusMode(enabled: boolean) {
  if (enabled === isFocusMode()) return;
  setIsFocusMode(enabled);

  if (enabled) {
    // The right side panel lives inside the block layout, so it would show
    // inside the overlay — close it while writing.
    setAllSidePanelsOpen(false);
    document.addEventListener('keydown', handleEscape);
  } else {
    document.removeEventListener('keydown', handleEscape);
    setAllSidePanelsOpen(true);
  }
}
