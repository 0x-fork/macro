import {
  $applyNodeReplacement,
  DecoratorNode,
  type DOMConversionMap,
  type EditorConfig,
  type EditorThemeClasses,
  type LexicalEditor,
  type LexicalNode,
  type LexicalUpdateJSON,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from 'lexical';
import { type DecoratorComponent, getDecorator } from '../decoratorRegistry';
import { $applyIdFromSerialized } from '../plugins/nodeIdPlugin';

export type GithubMentionInfo = {
  url: string;
};

export type SerializedGithubMentionNode = Spread<
  GithubMentionInfo,
  SerializedLexicalNode
>;

export type GithubMentionDecoratorProps = {
  url: string;
  key: NodeKey;
  theme: EditorThemeClasses;
};

export function getGithubSlug(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const parts = parsedUrl.pathname.split('/').filter(Boolean);
    if (parts.length >= 4 && parts[2] === 'pull') {
      return `${parts[0]}/${parts[1]}/pull/${parts[3]}`;
    }
    if (parts.length >= 4 && parts[2] === 'issues') {
      return `${parts[0]}/${parts[1]}/issues/${parts[3]}`;
    }
    return `${parsedUrl.hostname}${parsedUrl.pathname}`;
  } catch {
    return url;
  }
}

export class GithubMentionNode extends DecoratorNode<
  DecoratorComponent<GithubMentionDecoratorProps> | undefined
> {
  __url: string;

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
    return new GithubMentionNode(node.__url, node.__key);
  }

  constructor(url: string, key?: NodeKey) {
    super(key);
    this.__url = url;
  }

  static importJSON(serializedNode: SerializedGithubMentionNode) {
    const node = $createGithubMentionNode({
      url: serializedNode.url,
    }).updateFromJSON(serializedNode);
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedGithubMentionNode {
    return {
      ...super.exportJSON(),
      url: this.__url,
      type: GithubMentionNode.getType(),
      version: 1,
    };
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedGithubMentionNode>
  ): this {
    const self = super.updateFromJSON(serializedNode);
    self.setUrl(serializedNode.url);
    return self;
  }

  exportComponentProps(): GithubMentionInfo {
    return {
      url: this.__url,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    return document.createElement('span');
  }

  updateDOM(): boolean {
    return false;
  }

  getDataAttrs(): Record<string, string | boolean> {
    return {
      'data-github-mention': true,
      'data-github-url': this.__url,
    };
  }

  static importDOM(): DOMConversionMap<HTMLSpanElement> | null {
    return {
      span: (domNode: HTMLSpanElement) => {
        if (!domNode.hasAttribute('data-github-mention')) {
          return null;
        }
        return {
          conversion: (domNode: HTMLElement) => {
            const url = domNode.getAttribute('data-github-url');
            if (!url) return null;
            const node = $createGithubMentionNode({ url });
            return { node };
          },
          priority: 1,
        };
      },
    };
  }

  exportDOM() {
    const element = document.createElement('span');
    for (const [k, v] of Object.entries(this.getDataAttrs())) {
      element.setAttribute(k, v.toString());
    }
    element.textContent = getGithubSlug(this.__url);
    return { element };
  }

  getTextContent(): string {
    return getGithubSlug(this.__url);
  }

  getSearchText(): string {
    return getGithubSlug(this.__url);
  }

  getUrl(): string {
    return this.__url;
  }

  setUrl(url: string) {
    const writable = this.getWritable();
    writable.__url = url;
  }

  decorate(_: LexicalEditor, config: EditorConfig) {
    const decorator = getDecorator<GithubMentionNode>(GithubMentionNode);
    if (decorator) {
      return () =>
        decorator({
          ...this.exportComponentProps(),
          key: this.getKey(),
          theme: config.theme,
        });
    }
  }
}

export function $createGithubMentionNode(params: { url: string }) {
  const node = new GithubMentionNode(params.url);
  return $applyNodeReplacement(node);
}

export function $isGithubMentionNode(
  node: GithubMentionNode | LexicalNode | null | undefined
): node is GithubMentionNode {
  return node instanceof GithubMentionNode;
}
