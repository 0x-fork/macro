import { mergeRegister } from '@lexical/utils';
import { EmbedNode, isLoneEmbedUrl } from '@lexical-core';
import {
  $getSelection,
  $insertNodes,
  $isParagraphNode,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_LOW,
  createEditor,
  type LexicalEditor,
  PASTE_COMMAND,
} from 'lexical';
import { setEditorStateFromMarkdown } from '../../utils';

function registerMarkdownPastePlugin(editor: LexicalEditor) {
  const parseEditor = createEditor({
    namespace: 'paste-parser',
    editable: false,
    nodes: [...Array.from(editor._nodes.values()).map((node) => node.klass)],
  });

  let shiftDown = false;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      shiftDown = true;
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      shiftDown = false;
    }
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  return mergeRegister(
    editor.registerCommand(
      PASTE_COMMAND,
      (event: InputEvent | ClipboardEvent) => {
        if (shiftDown) return false;
        if (event instanceof ClipboardEvent) {
          const clipboard = event.clipboardData;
          if (!clipboard) return false;
          // do not handle richer clipboards.
          if (clipboard.getData('application/x-lexical-clipboard')) {
            return false;
          }
          if (clipboard.getData('text/html')) {
            return false;
          }
          const pastedText = clipboard.getData('text/plain');
          if (!pastedText) {
            return false;
          }

          // A pasted lone embeddable URL becomes an embed block through the
          // markdown parse below. Only allow that on an empty top-level
          // paragraph — pasting into surrounding text keeps the URL inline.
          if (editor.hasNodes([EmbedNode]) && isLoneEmbedUrl(pastedText)) {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              const anchorBlock = selection.isCollapsed()
                ? selection.anchor.getNode().getTopLevelElement()
                : null;
              const onEmptyParagraph =
                $isParagraphNode(anchorBlock) &&
                anchorBlock.getTextContent().trim() === '';
              if (!onEmptyParagraph) {
                event.preventDefault();
                selection.insertText(pastedText.trim());
                return true;
              }
            }
          }

          event.preventDefault();
          setEditorStateFromMarkdown(parseEditor, pastedText, 'both');
          const state = parseEditor.getEditorState().toJSON();
          const nodes = state.root.children.map((node) =>
            $parseSerializedNode(node)
          );
          $insertNodes(nodes);
        }
        return true;
      },
      COMMAND_PRIORITY_LOW
    ),
    () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    }
  );
}

export function markdownPastePlugin() {
  return (editor: LexicalEditor) => registerMarkdownPastePlugin(editor);
}
