import type { ElementTransformer } from '@lexical/markdown';
import type { ElementNode, LexicalNode } from 'lexical';
import { $createEmbedNode, $isEmbedNode, EmbedNode } from '../nodes/EmbedNode';
import { parseEmbedUrl } from '../utils/embed';
import { wrapXml, xmlMatcher } from './transformers';

// Internal transformer — always uses <m-embed> for unambiguous round-tripping.
export const I_EMBED: ElementTransformer = {
  dependencies: [EmbedNode],
  type: 'element',
  regExp: xmlMatcher('m-embed'),
  export: (node: LexicalNode) => {
    if (!$isEmbedNode(node)) return null;
    if (!node.getUrl()) return null;
    return wrapXml('m-embed', {
      provider: node.getProvider(),
      url: node.getUrl(),
    });
  },
  replace: (
    parentNode: ElementNode,
    _children: Array<LexicalNode>,
    match: Array<string>,
    _isImport: boolean
  ) => {
    try {
      const data = JSON.parse(match[1]);
      if (typeof data.url !== 'string' || !data.url) {
        throw new Error('Missing or invalid url field');
      }
      // Derive the provider from the url so a bad payload can't pick a
      // renderer that doesn't match its content.
      const embed = parseEmbedUrl(data.url);
      if (!embed) {
        throw new Error('Url is not embeddable');
      }
      parentNode.replace($createEmbedNode(embed));
    } catch (e) {
      console.error('Failed to parse m-embed:', e);
    }
  },
};

// External export — embeds degrade to their plain url.
export const E_EMBED: ElementTransformer = {
  dependencies: [EmbedNode],
  type: 'element',
  regExp: /$^/,
  export: (node: LexicalNode) => {
    if (!$isEmbedNode(node)) return null;
    return node.getUrl() || null;
  },
  replace: (
    _parentNode: ElementNode,
    _children: Array<LexicalNode>,
    _match: Array<string>,
    _isImport: boolean
  ) => {
    return false;
  },
};
