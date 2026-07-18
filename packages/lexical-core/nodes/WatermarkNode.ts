import {
  $applyNodeReplacement,
  $getNodeByKey,
  $getRoot,
  $hasUpdateTag,
  DecoratorNode,
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

export type WatermarkInfo = {
  content: string;
  /** When set, the watermark is exported as a link (e.g. the sender's referral URL). */
  href?: string;
};

export type SerializedWatermarkNode = Spread<
  WatermarkInfo,
  SerializedLexicalNode
>;

export type WatermarkDecoratorProps = {
  content: string;
  href?: string;
  key: NodeKey;
  theme: EditorThemeClasses;
};

export class WatermarkNode extends DecoratorNode<
  DecoratorComponent<WatermarkDecoratorProps> | undefined
> {
  __content: string;
  __href?: string;

  static getType() {
    return 'watermark';
  }

  isInline(): boolean {
    return true;
  }

  isIsolated(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return false;
  }

  static clone(node: WatermarkNode) {
    return new WatermarkNode(node.__content, node.__href, node.__key);
  }

  constructor(content: string, href?: string, key?: NodeKey) {
    super(key);
    this.__content = content;
    this.__href = href;
  }

  static importJSON(serializedNode: SerializedWatermarkNode) {
    const node = $createWatermarkNode({
      content: serializedNode.content,
      href: serializedNode.href,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedWatermarkNode {
    return {
      ...super.exportJSON(),
      content: this.__content,
      href: this.__href,
      type: WatermarkNode.getType(),
      version: 1,
    };
  }

  exportComponentProps(): WatermarkInfo {
    return {
      content: this.__content,
      href: this.__href,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const container = document.createElement('span');
    return container;
  }

  updateDOM(): boolean {
    return false;
  }

  getDataAttrs(): Record<string, string | boolean> {
    return {
      'data-watermark': true,
      'data-content': this.__content,
      ...(this.__href ? { 'data-href': this.__href } : {}),
    };
  }

  static importDOM(): DOMConversionMap<HTMLElement> | null {
    const conversionEntry = (domNode: HTMLElement) => {
      if (!domNode.hasAttribute('data-watermark')) {
        return null;
      }
      return {
        conversion: (domNode: HTMLElement) => {
          const content = domNode.getAttribute('data-content');

          if (content) {
            const node = $createWatermarkNode({
              content,
              href: domNode.getAttribute('data-href') ?? undefined,
            });
            return { node };
          }
          return null;
        },
        priority: 1 as const,
      };
    };
    return {
      span: conversionEntry,
      a: conversionEntry,
    };
  }

  exportDOM() {
    const element = this.__href
      ? document.createElement('a')
      : document.createElement('span');
    for (const [k, v] of Object.entries(this.getDataAttrs())) {
      element.setAttribute(k, v.toString());
    }
    if (this.__href && element instanceof HTMLAnchorElement) {
      element.href = this.__href;
      element.target = '_blank';
      element.rel = 'noopener';
    }
    element.className = 'macro-watermark-node';
    element.textContent = this.__content;
    return { element };
  }

  getTextContent(): string {
    return this.__content;
  }

  // To prevent the node from being removed during editing
  remove(): void {}

  // To manually remove
  forceRemove(): void {
    super.remove();
  }

  getContent() {
    return this.__content;
  }

  getHref() {
    return this.__href;
  }

  decorate(_: LexicalEditor, config: EditorConfig) {
    const decorator = getDecorator<WatermarkDecoratorProps>(WatermarkNode);
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

export function $createWatermarkNode(params: {
  content: string;
  href?: string;
}) {
  const node = new WatermarkNode(params.content, params.href);
  return $applyNodeReplacement(node);
}

export function $isWatermarkNode(
  node: WatermarkNode | LexicalNode | null | undefined
): node is WatermarkNode {
  return node instanceof WatermarkNode;
}

export function $removeAllWatermarkNodes(editor: LexicalEditor | undefined) {
  editor?.registerMutationListener(
    WatermarkNode,
    (mutations) => {
      editor?.update(
        () => {
          if (!$hasUpdateTag('registerMutationListener')) return;
          for (const [key, mutation] of mutations) {
            if (mutation !== 'created') continue;
            const node = $getNodeByKey(key);

            if (node instanceof WatermarkNode) node.forceRemove();
          }
        },
        { discrete: true, skipTransforms: true }
      );
    },
    { skipInitialization: true }
  );
}

export function $appendWatermarkNodeToLast(
  editor: LexicalEditor | undefined,
  content: string | undefined,
  sync = true,
  href?: string
) {
  let nodeKey: string | undefined;

  editor?.update(
    () => {
      if (!content) return;

      const node = $createWatermarkNode({ content, href });

      nodeKey = node.getKey();

      const root = $getRoot();

      root.getLastChild()?.insertAfter(node);
    },
    { discrete: sync || undefined }
  );

  return () => {
    editor?.update(
      () => {
        if (!nodeKey) return;

        const node = $getNodeByKey(nodeKey);

        if (node instanceof WatermarkNode) {
          node.forceRemove();
        }
      },
      { discrete: true }
    );
  };
}
