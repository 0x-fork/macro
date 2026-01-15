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

export type GithubLinkType = 'pull' | 'issue' | 'repo' | 'unknown';

export type GithubMentionInfo = {
  url: string;
  owner: string;
  repo: string;
  linkType: GithubLinkType;
  number?: number;
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
  __owner: string;
  __repo: string;
  __linkType: GithubLinkType;
  __number: number | undefined;
  __title: string | undefined;

  static getType() {
    return 'github-mention';
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  static clone(node: GithubMentionNode) {
    return new GithubMentionNode(
      node.__url,
      node.__owner,
      node.__repo,
      node.__linkType,
      node.__number,
      node.__title,
      node.__key
    );
  }

  constructor(
    url: string,
    owner: string,
    repo: string,
    linkType: GithubLinkType,
    number?: number,
    title?: string,
    key?: NodeKey
  ) {
    super(key);
    this.__url = url;
    this.__owner = owner;
    this.__repo = repo;
    this.__linkType = linkType;
    this.__number = number;
    this.__title = title;
  }

  static importJSON(serializedNode: SerializedGithubMentionNode) {
    const node = $createGithubMentionNode({
      url: serializedNode.url,
      owner: serializedNode.owner,
      repo: serializedNode.repo,
      linkType: serializedNode.linkType,
      number: serializedNode.number,
      title: serializedNode.title,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedGithubMentionNode {
    return {
      ...super.exportJSON(),
      url: this.__url,
      owner: this.__owner,
      repo: this.__repo,
      linkType: this.__linkType,
      number: this.__number,
      title: this.__title,
      type: GithubMentionNode.getType(),
      version: VERSION,
    };
  }

  exportComponentProps(): GithubMentionInfo {
    return {
      url: this.__url,
      owner: this.__owner,
      repo: this.__repo,
      linkType: this.__linkType,
      number: this.__number,
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
      const url = domNode.getAttribute('data-github-url');
      const owner = domNode.getAttribute('data-github-owner') || '';
      const repo = domNode.getAttribute('data-github-repo') || '';
      const linkType = (domNode.getAttribute('data-github-link-type') ||
        'unknown') as GithubLinkType;
      const numberStr = domNode.getAttribute('data-github-number');
      const number = numberStr ? parseInt(numberStr, 10) : undefined;
      const title = domNode.getAttribute('data-github-title') || undefined;

      if (url) {
        const node = $createGithubMentionNode({
          url,
          owner,
          repo,
          linkType,
          number,
          title,
        });
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
      'data-github-owner': this.__owner,
      'data-github-repo': this.__repo,
      'data-github-link-type': this.__linkType,
      'data-github-number': this.__number?.toString() || '',
      'data-github-title': this.__title || '',
    };
  }

  exportDOM() {
    const element = document.createElement('span');
    const attrs = this.getDataAttrs();
    for (const [k, v] of Object.entries(attrs)) {
      if (v) {
        element.setAttribute(k, v);
      }
    }
    element.textContent = this.getDisplayText();
    return { element };
  }

  getDisplayText(): string {
    if (this.__title) {
      return this.__title;
    }
    if (this.__number !== undefined) {
      return `${this.__owner}/${this.__repo}#${this.__number}`;
    }
    return `${this.__owner}/${this.__repo}`;
  }

  getTextContent(): string {
    return this.getDisplayText();
  }

  getSearchText(): string {
    return '';
  }

  getUrl(): string {
    return this.__url;
  }

  getOwner(): string {
    return this.__owner;
  }

  getRepo(): string {
    return this.__repo;
  }

  getLinkType(): GithubLinkType {
    return this.__linkType;
  }

  getNumber(): number | undefined {
    return this.__number;
  }

  getTitle(): string | undefined {
    return this.__title;
  }

  setTitle(title: string | undefined) {
    const writable = this.getWritable();
    writable.__title = title;
    return writable;
  }

  decorate(_: LexicalEditor, config: EditorConfig) {
    const decorator = getDecorator<GithubMentionNode>(GithubMentionNode);
    if (decorator) {
      return () =>
        decorator({
          url: this.__url,
          owner: this.__owner,
          repo: this.__repo,
          linkType: this.__linkType,
          number: this.__number,
          title: this.__title,
          key: this.getKey(),
          theme: config.theme,
        });
    }
  }
}

export function $createGithubMentionNode(
  params: GithubMentionInfo
): GithubMentionNode {
  const node = new GithubMentionNode(
    params.url,
    params.owner,
    params.repo,
    params.linkType,
    params.number,
    params.title
  );
  return $applyNodeReplacement(node);
}

export function $isGithubMentionNode(
  node: GithubMentionNode | LexicalNode | null | undefined
): node is GithubMentionNode {
  return node instanceof GithubMentionNode;
}
