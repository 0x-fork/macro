import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversion,
  type DOMConversionMap,
  type EditorConfig,
  type EditorThemeClasses,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { type DecoratorComponent, getDecorator } from '../decoratorRegistry';
import { $applyIdFromSerialized } from '../plugins/nodeIdPlugin';

const VERSION = 1;

export type LinkMentionInfo = {
  url: string;
  title?: string;
};

export type SerializedLinkMentionNode = Spread<
  LinkMentionInfo,
  SerializedLexicalNode
>;

export type LinkMentionDecoratorProps = LinkMentionInfo & {
  key: NodeKey;
  theme: EditorThemeClasses;
};

/**
 * An inline mention pill for an external link — shows the linked content's
 * title (e.g. a video or file name) instead of the raw url.
 */
export class LinkMentionNode extends DecoratorNode<
  DecoratorComponent<LinkMentionDecoratorProps> | undefined
> {
  __url: string;
  __title: string | undefined;

  static getType() {
    return 'link-mention';
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  static clone(node: LinkMentionNode) {
    return new LinkMentionNode(node.__url, node.__title, node.__key);
  }

  constructor(url: string, title?: string, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__title = title;
  }

  static importJSON(serializedNode: SerializedLinkMentionNode) {
    const node = $createLinkMentionNode({
      url: serializedNode.url,
      title: serializedNode.title,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedLinkMentionNode {
    return {
      ...super.exportJSON(),
      url: this.__url,
      title: this.__title,
      type: LinkMentionNode.getType(),
      version: VERSION,
    };
  }

  exportComponentProps(): LinkMentionInfo {
    return {
      url: this.__url,
      title: this.__title,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.setAttribute('data-link-mention', 'true');
    return span;
  }

  updateDOM(_prevNode: LinkMentionNode, _dom: HTMLElement): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap<HTMLElement> | null {
    const convert = (domNode: HTMLElement) => {
      const url = domNode.getAttribute('data-link-mention-url');
      const title =
        domNode.getAttribute('data-link-mention-title') || undefined;

      if (url) {
        return { node: $createLinkMentionNode({ url, title }) };
      }

      return null;
    };

    const wrapInCheck = (conversion: DOMConversion) => {
      return (node: HTMLElement) =>
        node.hasAttribute('data-link-mention') ? conversion : null;
    };

    return {
      span: wrapInCheck({ conversion: convert, priority: 1 }),
      a: wrapInCheck({ conversion: convert, priority: 1 }),
    };
  }

  exportDOM() {
    const element = document.createElement('a');
    element.setAttribute('data-link-mention', 'true');
    element.setAttribute('data-link-mention-url', this.__url);
    if (this.__title) {
      element.setAttribute('data-link-mention-title', this.__title);
    }
    element.setAttribute('href', this.__url);
    element.textContent = this.getTextContent();
    return { element };
  }

  getTextContent(): string {
    return this.__title || this.__url;
  }

  getSearchText(): string {
    return this.getTextContent();
  }

  getUrl(): string {
    return this.__url;
  }

  getTitle(): string | undefined {
    return this.__title;
  }

  setTitle(title: string | undefined) {
    const self = this.getWritable();
    self.__title = title;
  }

  decorate(_: LexicalEditor, config: EditorConfig) {
    const Component = getDecorator<LinkMentionDecoratorProps>(LinkMentionNode);

    if (!Component) return undefined;

    return () =>
      Component({
        ...this.exportComponentProps(),
        key: this.getKey(),
        theme: config.theme,
      });
  }
}

export function $createLinkMentionNode(params: LinkMentionInfo) {
  const node = new LinkMentionNode(params.url, params.title);
  return $applyNodeReplacement(node);
}

export function $isLinkMentionNode(
  node: LinkMentionNode | LexicalNode | null | undefined
): node is LinkMentionNode {
  return node instanceof LinkMentionNode;
}
