/**
 * @file A plugin allow editors to keep their previous selection when being
 * programmatically focused by element.focus() api.
 */
import { mergeRegister } from '@lexical/utils';
import { SKIP_SCROLL_INTO_VIEW_TAG } from '@macro-inc/lexical-core/constants';
import type { LexicalEditor } from 'lexical';
import { registerRootEventListener } from '../shared';

export function restoreFocusPlugin() {
  // We need to distinguish click-based focus events from programmatic
  // ones (el.focus()). We want to maintain the previous selection (editor.focus)
  // only if we are regaining focus programmatically. If click, let browser handle
  // focus and let lexical catch up.
  let clickFlag = false;
  return (editor: LexicalEditor) => {
    return mergeRegister(
      registerRootEventListener(editor, 'pointerdown', (e: PointerEvent) => {
        clickFlag = true;

        setTimeout(
          () => {
            clickFlag = false;
            // On click, focusin happens synchonously after pointerdown, with the setTimeout flipping the flag back after. This is deterministic and good.
            // On iOS touch these do not happen synchronously, so we're blindly flipping the flag back after 500ms.
          },
          e.pointerType === 'touch' ? 500 : 0
        );
      }),
      registerRootEventListener(editor, 'focusin', (e) => {
        if (clickFlag) return;
        e.preventDefault();
        // A programmatic refocus (e.g. focus restoration when the command
        // menu or another overlay closes) must not move the viewport: restore
        // the selection with scroll-into-view suppressed so a caret parked at
        // the top of the document doesn't yank a scrolled-down reader back up.
        editor.update(
          () => {
            editor.focus(undefined, { defaultSelection: 'rootStart' });
          },
          { tag: SKIP_SCROLL_INTO_VIEW_TAG }
        );
      })
    );
  };
}
