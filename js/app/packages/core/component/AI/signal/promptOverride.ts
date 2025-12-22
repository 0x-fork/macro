import { createSignal } from 'solid-js';

/**
 * Optional system-prompt override used by debug/playground surfaces.
 *
 * Default: undefined (no override).
 *
 * NOTE: Keep this cleared when leaving the playground to avoid affecting other chat surfaces.
 */
export const [promptOverride, setPromptOverride] = createSignal<
  string | undefined
>(undefined);
