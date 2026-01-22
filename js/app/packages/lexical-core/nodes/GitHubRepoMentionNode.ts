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

/**
 * Extracts the full repository name (owner/repo) from a GitHub repo ID.
 * @param repoId - The namespaced identifier (e.g., "github::repo:owner/name")
 * @returns The full repository name (e.g., "owner/name")
 */
export function getFullNameFromRepoId(repoId: string): string {
  const parts = repoId.split(':');
  return parts[parts.length - 1] || repoId;
}

export type GitHubRepoMentionInfo = {
  repoId: string; // github::repo:owner/name
  mentionUuid?: string;
};

export type SerializedGitHubRepoMentionNode = Spread<
  GitHubRepoMentionInfo,
  SerializedLexicalNode
>;

export type GitHubRepoMentionDecoratorProps = GitHubRepoMentionInfo & {
  key: NodeKey;
  theme: EditorThemeClasses;
};

export class GitHubRepoMentionNode extends DecoratorNode<
  DecoratorComponent<GitHubRepoMentionDecoratorProps> | undefined
> {
  __repoId: string;
  __mentionUuid: string | undefined;

  static getType() {
    return 'github-repo-mention';
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  static clone(node: GitHubRepoMentionNode) {
    return new GitHubRepoMentionNode(
      node.__repoId,
      node.__mentionUuid,
      node.__key
    );
  }

  constructor(repoId: string, mentionUuid?: string, key?: NodeKey) {
    super(key);
    this.__repoId = repoId;
    this.__mentionUuid = mentionUuid;
  }

  static importJSON(serializedNode: SerializedGitHubRepoMentionNode) {
    const node = $createGitHubRepoMentionNode({
      repoId: serializedNode.repoId,
      mentionUuid: serializedNode.mentionUuid,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedGitHubRepoMentionNode {
    return {
      ...super.exportJSON(),
      repoId: this.__repoId,
      mentionUuid: this.__mentionUuid,
      type: GitHubRepoMentionNode.getType(),
      version: VERSION,
    };
  }

  exportComponentProps(): GitHubRepoMentionInfo {
    return {
      repoId: this.__repoId,
      mentionUuid: this.__mentionUuid,
    };
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement('span');
    span.setAttribute('data-github-repo-mention', 'true');
    return span;
  }

  updateDOM(_prevNode: GitHubRepoMentionNode, _dom: HTMLElement): boolean {
    return false;
  }

  static importDOM(): DOMConversionMap<HTMLElement> | null {
    const convert = (domNode: HTMLElement) => {
      const repoId = domNode.getAttribute('data-repo-id');
      const mentionUuid =
        domNode.getAttribute('data-mention-uuid') || undefined;

      if (repoId) {
        const node = $createGitHubRepoMentionNode({
          repoId,
          mentionUuid,
        });
        return { node };
      }

      return null;
    };

    const wrapInCheck = (conversion: DOMConversion) => {
      return (node: HTMLElement) =>
        node.hasAttribute('data-github-repo-mention') ? conversion : null;
    };

    return {
      span: wrapInCheck({ conversion: convert, priority: 1 }),
      div: wrapInCheck({ conversion: convert, priority: 1 }),
      a: wrapInCheck({ conversion: convert, priority: 1 }),
    };
  }

  getDataAttrs(): Record<string, string> {
    return {
      'data-github-repo-mention': 'true',
      'data-repo-id': this.__repoId,
      'data-mention-uuid': this.__mentionUuid || '',
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
    element.textContent = getFullNameFromRepoId(this.__repoId);
    return { element };
  }

  getTextContent(): string {
    return getFullNameFromRepoId(this.__repoId);
  }

  getSearchText(): string {
    return '';
  }

  getRepoId(): string {
    return this.__repoId;
  }

  getMentionUuid(): string | undefined {
    return this.__mentionUuid;
  }

  setMentionUuid(mentionUuid: string | undefined) {
    const writable = this.getWritable();
    writable.__mentionUuid = mentionUuid;
    return writable;
  }

  decorate(_: LexicalEditor, config: EditorConfig) {
    const decorator = getDecorator<GitHubRepoMentionNode>(
      GitHubRepoMentionNode
    );
    if (decorator) {
      return () =>
        decorator({
          repoId: this.__repoId,
          mentionUuid: this.__mentionUuid,
          key: this.getKey(),
          theme: config.theme,
        });
    }
  }
}

export function $createGitHubRepoMentionNode(
  params: GitHubRepoMentionInfo
): GitHubRepoMentionNode {
  const node = new GitHubRepoMentionNode(params.repoId, params.mentionUuid);
  return $applyNodeReplacement(node);
}

export function $isGitHubRepoMentionNode(
  node: GitHubRepoMentionNode | LexicalNode | null | undefined
): node is GitHubRepoMentionNode {
  return node instanceof GitHubRepoMentionNode;
}
