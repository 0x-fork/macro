import { firstEmojiRun } from '@core/util/string';
import { registerLexicalTextEntity } from '@lexical/text';
import { mergeRegister } from '@lexical/utils';
import { $createEmojiTextNode, EmojiTextNode } from '@lexical-core';
import type { LexicalEditor, TextNode } from 'lexical';

/**
 * Wraps inline emoji runs in {@link EmojiTextNode}s so they render enlarged in
 * the live editor, matching how they appear in sent messages. Lexical's
 * text-entity helper keeps the wrapping in sync as text is typed, pasted,
 * deleted, or undone, and unwraps a node when its content stops being emoji.
 *
 * The node only round-trips as its raw characters, so serialized markdown is
 * unaffected. Register only on editors that should enlarge emoji (e.g. chat).
 */
export function inlineEmojiPlugin() {
  return (editor: LexicalEditor) =>
    mergeRegister(
      ...registerLexicalTextEntity(
        editor,
        firstEmojiRun,
        EmojiTextNode,
        (textNode: TextNode) => $createEmojiTextNode(textNode.getTextContent())
      )
    );
}
