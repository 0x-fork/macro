import type { TextMatchTransformer } from '@lexical/markdown';
import type { TextNode } from 'lexical';
import {
  $createLinkMentionNode,
  LinkMentionNode,
} from '../nodes/LinkMentionNode';
import { wrapXml, xmlMatcher } from './transformers';

// Internal Link Mentions
export const I_LINK_MENTION: TextMatchTransformer = {
  dependencies: [LinkMentionNode],
  type: 'text-match',
  regExp: xmlMatcher('m-link-mention'),
  importRegExp: xmlMatcher('m-link-mention'),
  export: (node) => {
    if (!(node instanceof LinkMentionNode)) return null;
    return wrapXml('m-link-mention', {
      url: node.getUrl(),
      title: node.getTitle() || '',
    });
  },
  replace: (node: TextNode, match: RegExpMatchArray) => {
    try {
      const data = JSON.parse(match[1]);
      if (typeof data.url !== 'string' || !data.url) {
        throw new Error('Missing or invalid url field');
      }
      const linkMentionNode = $createLinkMentionNode({
        url: data.url,
        title:
          typeof data.title === 'string' && data.title ? data.title : undefined,
      });
      node.replace(linkMentionNode);
    } catch (e) {
      console.error('Error in I_LINK_MENTION replace:', e);
    }
  },
};

// External Link Mentions — degrade to a regular markdown link. Export-only:
// inline decorator nodes are exported through text-match transformers.
export const E_LINK_MENTION: TextMatchTransformer = {
  dependencies: [LinkMentionNode],
  type: 'text-match',
  regExp: /$^/,
  export: (node) => {
    if (!(node instanceof LinkMentionNode)) return null;

    const url = node.getUrl();
    if (!url) return null;

    const title = node.getTitle();
    if (!title) return url;
    return `[${title.replace(/([[\]])/g, '\\$1')}](${url})`;
  },
};
