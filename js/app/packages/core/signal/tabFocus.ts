import { createEffect, createMemo, createSignal, on } from 'solid-js';

const [isTabFocused_, setIsTabFocused] = createSignal(document.hasFocus());
const maybeSetFocus = () => setIsTabFocused(document.hasFocus());

// Register global listeners directly - this is a true singleton that lives
// for the entire app lifetime, so cleanup is unnecessary.
window.addEventListener('focus', maybeSetFocus);
window.addEventListener('blur', maybeSetFocus);
window.addEventListener('visibilitychange', maybeSetFocus);

/** Whether the tab is currently focused */
export const isTabFocused = createMemo(() => isTabFocused_());

export function createTabFocusEffect(
  callback: (isTabFocused: boolean) => void
) {
  createEffect(
    on(isTabFocused, (curr, prev) => {
      if (curr === prev) return;
      callback(curr);
    })
  );
}
