import { $wrapNodeInElement, mergeRegister } from '@lexical/utils';
import {
  $createLinkMentionNode,
  type EmbedProvider,
  isLoneEmbedUrl,
  LinkMentionNode,
  parseEmbedUrl,
} from '@lexical-core';
import { $isChildOfCode } from '@lexical-core/utils';
import {
  $createParagraphNode,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $isRootOrShadowRoot,
  COMMAND_PRIORITY_HIGH,
  type LexicalEditor,
  type NodeKey,
  PASTE_COMMAND,
} from 'lexical';

export type EmbedPasteInfo = {
  nodeKey: NodeKey;
  url: string;
  provider: EmbedProvider;
};

type EmbedPastePluginProps = {
  /** Called after a pasted embeddable url was inserted as a link mention. */
  onPaste: (info: EmbedPasteInfo) => void;
};

/**
 * Pasting a lone embeddable URL (X post, YouTube video, Figma file) inserts
 * a link mention pill and notifies the caller so a "Paste as" menu can offer
 * to keep the mention or switch to a plain link or an embed.
 */
function registerEmbedPastePlugin(
  editor: LexicalEditor,
  props: EmbedPastePluginProps
) {
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
        // Shift-paste keeps the raw text, matching the markdown paste plugin.
        if (shiftDown) return false;
        if (!editor.hasNodes([LinkMentionNode])) return false;
        if (!(event instanceof ClipboardEvent)) return false;

        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        // Do not handle richer clipboards.
        if (clipboard.getData('application/x-lexical-clipboard')) return false;
        if (clipboard.getData('text/html')) return false;

        const pastedText = clipboard.getData('text/plain');
        if (!pastedText || !isLoneEmbedUrl(pastedText)) return false;
        const embed = parseEmbedUrl(pastedText);
        if (!embed) return false;

        const selection = $getSelection();
        // Pasting over selected text turns it into a link via the links
        // plugin — only handle collapsed selections here.
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          return false;
        }
        if ($isChildOfCode(selection.anchor.getNode())) return false;

        event.preventDefault();

        const mentionNode = $createLinkMentionNode({ url: embed.url });
        $insertNodes([mentionNode]);
        if ($isRootOrShadowRoot(mentionNode.getParentOrThrow())) {
          $wrapNodeInElement(mentionNode, $createParagraphNode);
        }
        mentionNode.selectEnd();

        const nodeKey = mentionNode.getKey();
        // Defer until after the update commits so the menu can anchor to the
        // mention's DOM element.
        queueMicrotask(() => {
          props.onPaste({
            nodeKey,
            url: embed.url,
            provider: embed.provider,
          });
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH
    ),
    () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    }
  );
}

export function embedPastePlugin(props: EmbedPastePluginProps) {
  return (editor: LexicalEditor) => registerEmbedPastePlugin(editor, props);
}
