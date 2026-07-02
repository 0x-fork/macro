import type { ElementTransformer } from '@lexical/markdown';
import { $isTextNode, type ElementNode, type LexicalNode } from 'lexical';
import { $createEmbedNode, $isEmbedNode, EmbedNode } from '../nodes/EmbedNode';
import { parseEmbedUrl } from '../utils/embed';

const M_LINK_LINE_REGEX = /^<m-link>(\{.*\})<\/m-link>\s*$/;
const BARE_URL_LINE_REGEX = /^(https?:\/\/\S+)\s*$/;

/** Strip protocol and www so pasted links compare equal to their display text. */
function normalizeUrlForComparison(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '');
}

/**
 * Extract the URL from a line that consists solely of a link — either a bare
 * URL or a single <m-link> whose text is the URL itself (a pasted link, not a
 * deliberately titled one).
 */
function extractLoneUrl(line: string): string | null {
  const mLink = line.match(M_LINK_LINE_REGEX);
  if (mLink) {
    try {
      const data = JSON.parse(mLink[1]);
      if (typeof data.url !== 'string' || !data.url) return null;
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (
        text &&
        normalizeUrlForComparison(text) !== normalizeUrlForComparison(data.url)
      ) {
        return null;
      }
      return data.url;
    } catch {
      return null;
    }
  }
  return line.match(BARE_URL_LINE_REGEX)?.[1] ?? null;
}

/**
 * Embed transformer. Exports embed nodes as their plain URL so the markdown
 * degrades to a link everywhere else, and imports lines that consist solely
 * of an embeddable URL (bare or auto-linked) as embed nodes.
 */
export const I_EMBED: ElementTransformer = {
  dependencies: [EmbedNode],
  type: 'element',
  regExp: /^(?:<m-link>\{.*\}<\/m-link>|https?:\/\/\S+)\s*$/,
  export: (node: LexicalNode) => {
    if (!$isEmbedNode(node)) return null;
    return node.getUrl();
  },
  replace: (
    parentNode: ElementNode,
    children: Array<LexicalNode>,
    match: Array<string>,
    isImport: boolean
  ) => {
    if (!isImport) return false;
    const restoreAndBail = () => {
      // The importer slices the match off the text node before calling
      // replace, so put the line back for the remaining transformers.
      const textNode = children?.[0];
      if (textNode && $isTextNode(textNode)) {
        textNode.setTextContent(match[0]);
      }
      return false;
    };

    const url = extractLoneUrl(match[0]);
    if (!url) return restoreAndBail();
    const embed = parseEmbedUrl(url);
    if (!embed) return restoreAndBail();

    parentNode.replace($createEmbedNode(embed));
  },
};
