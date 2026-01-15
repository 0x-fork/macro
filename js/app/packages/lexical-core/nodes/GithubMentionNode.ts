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

export type GithubMentionInfo = {
  url: string;
  slug: string;
  title?: string;
};

export type SerializedGithubMentionNode = Spread<
  GithubMentionInfo,
  SerializedLexicalNode
>;

export type GithubMentionDecoratorProps = GithubMentionInfo & {
  key: NodeKey;
  theme: EditorThemeClasses;
};

export class GithubMentionNode extends DecoratorNode<
  DecoratorComponent<GithubMentionDecoratorProps> | undefined
> {
  __url: string;
  __slug: string;
  __title?: string;

  static getType() {
    return 'github-mention';
  }

  static clone(node: GithubMentionNode) {
    return new GithubMentionNode(
      node.__url,
      node.__slug,
      node.__title,
      node.__key
    );
  }

  constructor(url: string, slug: string, title?: string, key?: NodeKey) {
    super(key);
    this.__url = url;
    this.__slug = slug;
    this.__title = title;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  static importJSON(serializedNode: SerializedGithubMentionNode) {
    const node = $createGithubMentionNode({
      url: serializedNode.url,
      slug: serializedNode.slug,
      title: serializedNode.title,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedGithubMentionNode {
    return {
      ...super.exportJSON(),
      url: this.__url,
      slug: this.__slug,
      title: this.__title,
      type: GithubMentionNode.getType(),
      version: VERSION,
    };
  }

  exportComponentProps(): GithubMentionInfo {
    return {
      url: this.__url,
      slug: this.__slug,
      title: this.__title,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.setAttribute('data-github-mention', 'true');
    return span;
  }

  updateDOM(_prevNode: GithubMentionNode, _dom: HTMLElement): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap<HTMLElement> | null {
    const convert = (domNode: HTMLElement) => {
      const url = domNode.getAttribute('data-github-url') || '';
      const slug = domNode.getAttribute('data-github-slug') || '';
      const title = domNode.getAttribute('data-github-title') || undefined;

      if (url && slug) {
        const node = $createGithubMentionNode({ url, slug, title });
        return { node };
      }

      return null;
    };

    const wrapInCheck = (conversion: DOMConversion) => {
      return (node: HTMLElement) =>
        node.hasAttribute('data-github-mention') ? conversion : null;
    };

    return {
      span: wrapInCheck({ conversion: convert, priority: 1 }),
      div: wrapInCheck({ conversion: convert, priority: 1 }),
      a: wrapInCheck({ conversion: convert, priority: 1 }),
    };
  }

  getDataAttrs(): Record<string, string> {
    return {
      'data-github-mention': 'true',
      'data-github-url': this.__url,
      'data-github-slug': this.__slug,
      'data-github-title': this.__title || '',
    };
  }

  exportDOM() {
    const element = document.createElement('span');
    const attrs = this.getDataAttrs();
    for (const [key, value] of Object.entries(attrs)) {
      if (value) {
        element.setAttribute(key, value);
      }
    }
    element.textContent = this.__title || this.__slug || this.__url;
    return { element };
  }

  getTextContent(): string {
    return this.__title || this.__slug || this.__url;
  }

  decorate(
    editor: LexicalEditor,
    config: EditorConfig
  ): DecoratorComponent<GithubMentionDecoratorProps> | undefined {
    const component = getDecorator<GithubMentionDecoratorProps>(
      GithubMentionNode.getType()
    );

    if (component) {
      return component({
        ...this.exportComponentProps(),
        key: this.__key,
        theme: config.theme ?? {},
      });
    }
    return component;
  }

  getUrl(): string {
    return this.__url;
  }

  getSlug(): string {
    return this.__slug;
  }

  getTitle(): string | undefined {
    return this.__title;
  }

  setTitle(title: string | undefined) {
    const writable = this.getWritable();
    writable.__title = title;
  }
}

export function $createGithubMentionNode(
  info: GithubMentionInfo
): GithubMentionNode {
  return $applyNodeReplacement(
    new GithubMentionNode(info.url, info.slug, info.title)
  );
}

export function $isGithubMentionNode(
  node: LexicalNode | null | undefined
): node is GithubMentionNode {
  return node instanceof GithubMentionNode;
}
