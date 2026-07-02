import {
  $applyNodeReplacement,
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
import {
  type EmbedData,
  type EmbedProvider,
  parseEmbedUrl,
} from '../utils/embed';
import { DecoratorBlockNode } from './DecoratorBlockNode';

export type SerializedEmbedNode = Spread<EmbedData, SerializedLexicalNode>;

export type EmbedDecoratorProps = EmbedData & {
  key: NodeKey;
  theme: EditorThemeClasses;
};

export class EmbedNode extends DecoratorBlockNode<
  DecoratorComponent<EmbedDecoratorProps> | undefined
> {
  __provider: EmbedProvider;
  __url: string;

  static getType() {
    return 'embed';
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  static clone(node: EmbedNode) {
    return new EmbedNode(node.__provider, node.__url, node.__key);
  }

  constructor(provider: EmbedProvider, url: string, key?: NodeKey) {
    super('left', key);
    this.__provider = provider;
    this.__url = url;
  }

  static importJSON(serializedNode: SerializedEmbedNode) {
    const node = $createEmbedNode({
      provider: serializedNode.provider,
      url: serializedNode.url,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedEmbedNode {
    return {
      ...super.exportJSON(),
      provider: this.__provider,
      url: this.__url,
      type: EmbedNode.getType(),
      version: 1,
    };
  }

  exportComponentProps(): EmbedData {
    return {
      provider: this.__provider,
      url: this.__url,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const container = document.createElement('div');
    container.style.display = 'block';
    return container;
  }

  updateDOM(): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap<HTMLDivElement> | null {
    return {
      div: (domNode: HTMLDivElement) => {
        const url = domNode.getAttribute('data-embed-url');
        if (!url) return null;
        const embed = parseEmbedUrl(url);
        if (!embed) return null;
        return {
          conversion: () => ({ node: $createEmbedNode(embed) }),
          priority: 1,
        };
      },
    };
  }

  exportDOM() {
    const element = document.createElement('div');
    element.setAttribute('data-embed-provider', this.__provider);
    element.setAttribute('data-embed-url', this.__url);
    const anchor = document.createElement('a');
    anchor.setAttribute('href', this.__url);
    anchor.textContent = this.__url;
    element.appendChild(anchor);
    return { element };
  }

  getTextContent(): string {
    return this.__url;
  }

  getProvider(): EmbedProvider {
    return this.__provider;
  }

  getUrl(): string {
    return this.__url;
  }

  decorate(_: LexicalEditor, config: EditorConfig) {
    const decorator = getDecorator<EmbedDecoratorProps>(EmbedNode);
    if (decorator) {
      return () =>
        decorator({
          provider: this.__provider,
          url: this.__url,
          key: this.getKey(),
          theme: config.theme,
        });
    }
  }
}

export function $createEmbedNode(params: EmbedData): EmbedNode {
  const node = new EmbedNode(params.provider, params.url);
  return $applyNodeReplacement(node);
}

export function $isEmbedNode(
  node: LexicalNode | null | undefined
): node is EmbedNode {
  return node instanceof EmbedNode;
}
