/**
 * @file Global vim-mode state shared between every editor instance, the
 * settings toggle, and the status bar.
 */
import { makePersisted } from '@solid-primitives/storage';
import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { RegisterContent, VimMode } from './types';

/**
 * Whether vim mode is enabled for all editable markdown surfaces.
 * Persisted to localStorage so the preference survives reloads.
 */
export const [vimModeEnabled, setVimModeEnabled] = makePersisted(
  createSignal<boolean>(false),
  { name: 'vim-mode-enabled' }
);

/** What the status bar renders. Written by the focused editor's engine. */
export type VimStatus = {
  /** Mode of the focused vim editor. */
  mode: VimMode;
  /** Keys buffered toward a multi-key command (e.g. `"d`, `2d`, `da`). */
  pending: string;
  /** True while some vim-enabled editor is focused. */
  active: boolean;
};

const [vimStatus, setVimStatus] = createStore<VimStatus>({
  mode: 'normal',
  pending: '',
  active: false,
});

export { setVimStatus, vimStatus };

/**
 * The unnamed register, shared across all editors like a single vim instance
 * — yank in a document, paste into a chat message.
 */
let unnamedRegister: RegisterContent | null = null;

export function setRegister(content: RegisterContent | null) {
  if (!content) return;
  unnamedRegister = content;
  // Mirror yanks into the system clipboard (best effort) so vim yanks and
  // OS-level paste interoperate.
  if (content.text) {
    navigator.clipboard?.writeText(content.text).catch(() => {});
  }
}

export function getRegister(): RegisterContent | null {
  return unnamedRegister;
}
