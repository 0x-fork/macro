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

export type GitHubRepoMentionInfo = {
  repoId: string; // github::repo:owner/name
  fullName: string; // owner/name
  owner: string;
  avatarUrl: string;
  url: string;
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
  __fullName: string;
  __owner: string;
  __avatarUrl: string;
  __url: string;
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
      node.__fullName,
      node.__owner,
      node.__avatarUrl,
      node.__url,
      node.__mentionUuid,
      node.__key
    );
  }

  constructor(
    repoId: string,
    fullName: string,
    owner: string,
    avatarUrl: string,
    url: string,
    mentionUuid?: string,
    key?: NodeKey
  ) {
    super(key);
    this.__repoId = repoId;
    this.__fullName = fullName;
    this.__owner = owner;
    this.__avatarUrl = avatarUrl;
    this.__url = url;
    this.__mentionUuid = mentionUuid;
  }

  static importJSON(serializedNode: SerializedGitHubRepoMentionNode) {
    const node = $createGitHubRepoMentionNode({
      repoId: serializedNode.repoId,
      fullName: serializedNode.fullName,
      owner: serializedNode.owner,
      avatarUrl: serializedNode.avatarUrl,
      url: serializedNode.url,
      mentionUuid: serializedNode.mentionUuid,
    });
    $applyIdFromSerialized(node, serializedNode);
    return node;
  }

  exportJSON(): SerializedGitHubRepoMentionNode {
    return {
      ...super.exportJSON(),
      repoId: this.__repoId,
      fullName: this.__fullName,
      owner: this.__owner,
      avatarUrl: this.__avatarUrl,
      url: this.__url,
      mentionUuid: this.__mentionUuid,
      type: GitHubRepoMentionNode.getType(),
      version: VERSION,
    };
  }

  exportComponentProps(): GitHubRepoMentionInfo {
    return {
      repoId: this.__repoId,
      fullName: this.__fullName,
      owner: this.__owner,
      avatarUrl: this.__avatarUrl,
      url: this.__url,
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
      const fullName = domNode.getAttribute('data-full-name') || '';
      const owner = domNode.getAttribute('data-owner') || '';
      const avatarUrl = domNode.getAttribute('data-avatar-url') || '';
      const url = domNode.getAttribute('data-url') || '';
      const mentionUuid =
        domNode.getAttribute('data-mention-uuid') || undefined;

      if (repoId && fullName) {
        const node = $createGitHubRepoMentionNode({
          repoId,
          fullName,
          owner,
          avatarUrl,
          url,
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
      'data-full-name': this.__fullName,
      'data-owner': this.__owner,
      'data-avatar-url': this.__avatarUrl,
      'data-url': this.__url,
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
    element.textContent = this.__fullName;
    return { element };
  }

  getTextContent(): string {
    return this.__fullName;
  }

  getSearchText(): string {
    return '';
  }

  getRepoId(): string {
    return this.__repoId;
  }

  getFullName(): string {
    return this.__fullName;
  }

  getOwner(): string {
    return this.__owner;
  }

  getAvatarUrl(): string {
    return this.__avatarUrl;
  }

  getUrl(): string {
    return this.__url;
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
    const decorator = getDecorator<GitHubRepoMentionNode>(GitHubRepoMentionNode);
    if (decorator) {
      return () =>
        decorator({
          repoId: this.__repoId,
          fullName: this.__fullName,
          owner: this.__owner,
          avatarUrl: this.__avatarUrl,
          url: this.__url,
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
  const node = new GitHubRepoMentionNode(
    params.repoId,
    params.fullName,
    params.owner,
    params.avatarUrl,
    params.url,
    params.mentionUuid
  );
  return $applyNodeReplacement(node);
}

export function $isGitHubRepoMentionNode(
  node: GitHubRepoMentionNode | LexicalNode | null | undefined
): node is GitHubRepoMentionNode {
  return node instanceof GitHubRepoMentionNode;
}
