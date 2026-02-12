import { createMemo, createSignal } from 'solid-js';
import { PREDEFINED_VIEWS } from './predefined-views';
import { setPendingView, setPendingPinnedItem, type PinnedItem } from './sidebar-selection-state';

/**
 * Stored pinned items for hotkey handlers.
 * Updated when updatePinnedItemsForHotkeys is called.
 */
let registeredPinnedItems: PinnedItem[] = [];

/**
 * State machine for sidebar hotkey sequence:
 * - 'idle': waiting for 'v' key
 * - 'goto': 'v' was pressed, waiting for view index or 'p'
 * - 'pinned': 'v p' was pressed, waiting for pinned item index
 */
type HotkeyState = 'idle' | 'goto' | 'pinned';
const [hotkeyState, setHotkeyState] = createSignal<HotkeyState>('idle');

/**
 * Timeout to reset state if no key is pressed
 */
let stateTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Get the index from a hotkey character
 */
function getIndexFromHotkey(key: string): number | undefined {
  if (key >= '1' && key <= '9') return parseInt(key) - 1; // 1-9 → 0-8
  if (key === '0') return 9; // 0 → 9
  const lowerKey = key.toLowerCase();
  if (lowerKey >= 'a' && lowerKey <= 'z') return lowerKey.charCodeAt(0) - 97 + 10; // a-z → 10-35
  return undefined;
}

/**
 * Returns a reactive memo that is true when the "v" (views) scope is active.
 * Use this to show shortcut hints in the sidebar.
 */
export function useIsGoToScopeActive() {
  return createMemo(() => {
    const state = hotkeyState();
    return state === 'goto' || state === 'pinned';
  });
}

/**
 * Returns a reactive memo that is true when we're in pinned selection mode (v p).
 * Use this to show shortcut hints for pinned items.
 */
export function useIsPinnedScopeActive() {
  return createMemo(() => hotkeyState() === 'pinned');
}

/**
 * Reset state to idle
 */
function resetState() {
  setHotkeyState('idle');
  if (stateTimeout) {
    clearTimeout(stateTimeout);
    stateTimeout = null;
  }
}

/**
 * Set state with auto-reset timeout
 */
function setState(state: HotkeyState) {
  setHotkeyState(state);
  
  // Clear any existing timeout
  if (stateTimeout) {
    clearTimeout(stateTimeout);
  }
  
  // Auto-reset after 2 seconds if not idle
  if (state !== 'idle') {
    stateTimeout = setTimeout(() => {
      setHotkeyState('idle');
      stateTimeout = null;
    }, 2000);
  }
}

/**
 * Check if an element is an editable input
 */
function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tagName = el.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

/**
 * Handle view selection by key
 */
function handleViewKey(key: string): boolean {
  const index = getIndexFromHotkey(key);
  if (index !== undefined && index < PREDEFINED_VIEWS.length) {
    setPendingView(PREDEFINED_VIEWS[index]);
    return true;
  }
  return false;
}

/**
 * Handle pinned item selection by key
 */
function handlePinnedItemKey(key: string): boolean {
  const index = getIndexFromHotkey(key);
  if (index !== undefined && registeredPinnedItems[index]) {
    setPendingPinnedItem(registeredPinnedItems[index]);
    return true;
  }
  return false;
}

/**
 * Register hotkeys for all sidebar views and pinned items.
 * Uses a custom keyboard listener instead of the hotkey system
 * to support the v -> p -> <key> sequence for pinned items.
 * 
 * Shortcuts:
 * - v 1-9, 0, a-z: Select view by index
 * - v p 1-9, 0, a-z: Select pinned item by index
 * - Escape: Cancel selection
 */
export function registerSidebarHotkeys() {
  document.addEventListener('keydown', (e) => {
    // Don't handle if an editable element is focused
    if (isEditableElement(document.activeElement)) return;
    
    // Ignore modifier keys alone
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    
    // Ignore if any modifier is held (except for the key itself)
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    
    const key = e.key.toLowerCase();
    const currentState = hotkeyState();
    
    // Handle based on current state
    switch (currentState) {
      case 'idle':
        if (key === 'v') {
          setState('goto');
          e.preventDefault();
          e.stopPropagation();
        }
        break;
        
      case 'goto':
        if (key === 'escape') {
          resetState();
          e.preventDefault();
          e.stopPropagation();
        } else if (key === 'p') {
          setState('pinned');
          e.preventDefault();
          e.stopPropagation();
        } else {
          // Try to handle as view key
          const handled = handleViewKey(key);
          resetState();
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
        break;
        
      case 'pinned':
        if (key === 'escape') {
          resetState();
          e.preventDefault();
          e.stopPropagation();
        } else {
          // Try to handle as pinned item key
          const handled = handlePinnedItemKey(key);
          resetState();
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
        break;
    }
  }, { capture: true });
}

/**
 * Update the pinned items that hotkeys will reference.
 * Call this when pinned items change.
 */
export function updatePinnedItemsForHotkeys(items: PinnedItem[]) {
  registeredPinnedItems = items;
}
