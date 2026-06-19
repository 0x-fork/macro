import {
  $applyNodeReplacement,
  $getSelection,
  $isRangeSelection,
  type EditorConfig,
  type LexicalNode,
  type SerializedTextNode,
  type Spread,
  TextNode,
} from 'lexical';

export type SerializedEmojiTextNode = Spread<
  SerializedTextNode,
  { type: 'emoji-text' }
>;

/**
 * A TextNode that renders its emoji content using the editor theme's
 * `inline-emoji` class. Created by the inline-emoji text-entity transform in
 * the channel composer so typed/pasted emoji match sent messages. It holds
 * plain emoji text, so it serializes to markdown as its raw characters.
 */
export class EmojiTextNode extends TextNode {
  static getType() {
    return 'emoji-text';
  }

  static clone(node: EmojiTextNode): EmojiTextNode {
    return new EmojiTextNode(node.__text, node.__key);
  }

  isInline(): true {
    return true;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const element = super.createDOM(config);
    const themeClass = config.theme['inline-emoji'];
    if (themeClass) {
      element.className = `${element.className} ${themeClass}`.trim();
    }
    return element;
  }

  // Treat the emoji as an atomic text entity: typing at its edges inserts into
  // adjacent nodes rather than extending the enlarged run.
  canInsertTextBefore(): boolean {
    return false;
  }

  canInsertTextAfter(): boolean {
    return false;
  }

  isTextEntity(): true {
    return true;
  }

  exportJSON(): SerializedEmojiTextNode {
    return {
      ...super.exportJSON(),
      type: 'emoji-text',
      version: 1,
    };
  }

  static importJSON(serializedNode: SerializedEmojiTextNode): EmojiTextNode {
    return $createEmojiTextNode(serializedNode.text).updateFromJSON(
      serializedNode
    );
  }
}

export function $createEmojiTextNode(text = ''): EmojiTextNode {
  const node = new EmojiTextNode(text);
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    node.setFormat(selection.format);
  }
  return $applyNodeReplacement(node);
}

export function $isEmojiTextNode(
  node: LexicalNode | null | undefined
): node is EmojiTextNode {
  return node instanceof EmojiTextNode;
}
