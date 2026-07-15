/**
 * @file The Lexical plugin that wires vim emulation into an editor.
 *
 * Registered unconditionally for every editor created through
 * `createLexicalWrapper`, but inert until the global vim-mode setting is on.
 * Interception happens on `KEY_DOWN_COMMAND` at CRITICAL priority: returning
 * true there stops Lexical from dispatching its per-key commands
 * (KEY_ESCAPE, KEY_ENTER, arrows, …), which is exactly the boundary between
 * "vim handled it" and "the app handles it".
 *
 * Inline menus (mentions/actions/emoji) listen on document capture-phase
 * keydown and stop propagation before Lexical sees the event, so an open
 * menu naturally wins over vim — Escape closes the menu first, exactly like
 * vim popups.
 */
import { mergeRegister } from '@lexical/utils';
import {
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { createEffect, createRoot } from 'solid-js';
import { hideCaretOverlay, updateCaretOverlay } from './caretOverlay';
import { VimEngine } from './engine';
import { createLexicalVimAdapter } from './lexicalVimAdapter';
import { setVimStatus, vimModeEnabled } from './vimSignals';
import './vim.css';

/** Editor-root classes driven by vim state (styled in vim.css). */
const ENABLED_CLASS = 'vim-enabled';
const HIDE_CARET_CLASS = 'vim-caret-hidden';

function registerVimPlugin(editor: LexicalEditor): () => void {
  const adapter = createLexicalVimAdapter(editor);
  const engine = new VimEngine(adapter);

  let hasFocus = false;

  const vimActive = () =>
    vimModeEnabled() && editor.isEditable() && !editor.isComposing();

  /** The block caret shows in any non-insert mode while focused. */
  const syncCaretAndClasses = () => {
    const root = editor.getRootElement();
    if (!root) return;
    const active = vimModeEnabled() && editor.isEditable();
    root.classList.toggle(ENABLED_CLASS, active);
    const blockCaret = active && hasFocus && engine.mode !== 'insert';
    root.classList.toggle(HIDE_CARET_CLASS, blockCaret);
    if (blockCaret) updateCaretOverlay(editor);
    else hideCaretOverlay(editor);
  };

  const onSelectionChange = () => {
    if (!hasFocus || !vimActive()) return;
    const root = editor.getRootElement();
    const selection = (editor._window ?? window).getSelection();
    // Mouse selections should flip normal<->visual like vim's mouse support.
    if (root && selection?.focusNode && root.contains(selection.focusNode)) {
      engine.noteExternalSelection(!selection.isCollapsed);
    }
    syncCaretAndClasses();
  };

  const onScrollOrResize = () => {
    if (hasFocus && vimActive() && engine.mode !== 'insert') {
      updateCaretOverlay(editor);
    }
  };

  const onFocusIn = () => {
    hasFocus = true;
    if (vimActive()) {
      setVimStatus({ active: true });
      engine.publishStatus();
    }
    syncCaretAndClasses();
  };

  const onFocusOut = (e: FocusEvent) => {
    const root = editor.getRootElement();
    // Ignore focus moves within the editor subtree.
    if (
      root &&
      e.relatedTarget instanceof Node &&
      root.contains(e.relatedTarget)
    ) {
      return;
    }
    hasFocus = false;
    setVimStatus({ active: false });
    engine.reset();
    syncCaretAndClasses();
  };

  // Reactively re-sync when the global toggle flips.
  const disposeReactive = createRoot((dispose) => {
    createEffect(() => {
      const enabled = vimModeEnabled();
      if (!enabled) {
        engine.reset();
        if (hasFocus) setVimStatus({ active: false });
      } else if (hasFocus) {
        setVimStatus({ active: true });
        engine.publishStatus();
      }
      syncCaretAndClasses();
    });
    return dispose;
  });

  const removeRootListener = editor.registerRootListener((root, prevRoot) => {
    if (prevRoot) {
      prevRoot.removeEventListener('focusin', onFocusIn);
      prevRoot.removeEventListener('focusout', onFocusOut);
      prevRoot.classList.remove(ENABLED_CLASS, HIDE_CARET_CLASS);
    }
    if (root) {
      root.addEventListener('focusin', onFocusIn);
      root.addEventListener('focusout', onFocusOut);
      syncCaretAndClasses();
    }
  });

  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('scroll', onScrollOrResize, { capture: true });
  window.addEventListener('resize', onScrollOrResize);

  const removeCommands = mergeRegister(
    editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (!vimActive()) return false;
        const handled =
          engine.mode === 'insert'
            ? engine.handleInsertKey(event)
            : engine.handleNormalKey(event);
        if (handled) {
          event.preventDefault();
          event.stopPropagation();
          syncCaretAndClasses();
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_CRITICAL
    ),
    editor.registerUpdateListener(() => {
      syncCaretAndClasses();
    }),
    editor.registerEditableListener(() => {
      if (!editor.isEditable()) engine.reset();
      syncCaretAndClasses();
    })
  );

  return () => {
    document.removeEventListener('selectionchange', onSelectionChange);
    window.removeEventListener('scroll', onScrollOrResize, { capture: true });
    window.removeEventListener('resize', onScrollOrResize);
    removeRootListener();
    removeCommands();
    disposeReactive();
    hideCaretOverlay(editor);
    if (hasFocus) setVimStatus({ active: false });
  };
}

/**
 * Vim emulation for a markdown surface. Inert unless the user has enabled
 * vim mode (see `vimSignals.ts`); registered globally so that flipping the
 * setting upgrades every editable surface at once.
 */
export function vimPlugin() {
  return (editor: LexicalEditor) => registerVimPlugin(editor);
}
