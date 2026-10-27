/**
 * WhatsApp formats with single markers (`*bold*`, `_italic_`, `~strike~`,
 * `` `code` ``, ```` ```monospace``` ````); the composer and the message
 * renderer speak Markdown. These convert at the send and display edges.
 */

const FENCE = /^```/;

/** Markdown inline syntax the composer writes, one alternative per group. */
const MARKDOWN_INLINE =
  /(`+)([^`]|[^`][\s\S]*?[^`])\1|\\([\\`*_{}[\]()#+\-.!~>|<])|\*\*((?:[^*]|\*[^*\s](?:[^*]*?[^*\s])?\*)+?)\*\*|__([\s\S]+?)__|\*([^*\s](?:[\s\S]*?[^*\s])?)\*|_([^_\s](?:[\s\S]*?[^_\s])?)_|~~([\s\S]+?)~~|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;

function markdownInline(text: string): string {
  return text.replace(
    MARKDOWN_INLINE,
    (
      _match,
      _ticks: string | undefined,
      code: string | undefined,
      escaped: string | undefined,
      starBold: string | undefined,
      underscoreBold: string | undefined,
      starItalic: string | undefined,
      underscoreItalic: string | undefined,
      strike: string | undefined,
      linkText: string | undefined,
      linkUrl: string | undefined,
      autolink: string | undefined
    ) => {
      if (code !== undefined) return `\`${code}\``;
      if (escaped !== undefined) return escaped;
      const bold = starBold ?? underscoreBold;
      if (bold !== undefined) return `*${markdownInline(bold)}*`;
      const italic = starItalic ?? underscoreItalic;
      if (italic !== undefined) return `_${markdownInline(italic)}_`;
      if (strike !== undefined) return `~${markdownInline(strike)}~`;
      if (linkText !== undefined && linkUrl !== undefined)
        return linkText === linkUrl
          ? linkUrl
          : `${markdownInline(linkText)} (${linkUrl})`;
      return autolink ?? '';
    }
  );
}

function markdownLine(line: string): string {
  const heading = /^#{1,6}\s+(.*)$/.exec(line);
  if (heading) return `*${markdownInline(heading[1] ?? '')}*`;
  return markdownInline(line.replace(/^(\s*)[*+]\s+/, '$1- '));
}

/** Composer Markdown to the text WhatsApp sends and formats. */
export function markdownToWhatsApp(markdown: string): string {
  const out: string[] = [];
  let code: string[] | undefined;
  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) {
      if (code) {
        out.push(`\`\`\`${code.join('\n')}\`\`\``);
        code = undefined;
      } else code = [];
      continue;
    }
    if (code) code.push(line);
    else out.push(markdownLine(line));
  }
  // An unterminated fence still sends its lines as monospace.
  if (code) out.push(`\`\`\`${code.join('\n')}\`\`\``);
  return out.join('\n').trim();
}

/** WhatsApp's markers, bounded by a non-word character or the line edge. */
const WHATSAPP_INLINE =
  /(`[^`\n]+`)|((?:https?:\/\/|www\.)[^\s<>]*[^\s<>.,;:!?'")\]*_~])|(^|[^\p{L}\p{N}*_~])([*_~])(?!\s)([^\n]*?[^\s*_~]|[^\s*_~])\4(?![\p{L}\p{N}*_~])/gu;

/** ASCII punctuation, except `@`. */
const PUNCTUATION = /[!-/:-?[-`{-~]/g;

/**
 * Received text as literal Markdown text: every punctuation mark becomes a
 * numeric character reference, which the Markdown importer decodes back to
 * the character after it has looked for syntax. No sender-written Markdown,
 * HTML or Macro tag (`<m-user-mention>`, `[[…]]`, `$$…$$`) can take effect.
 */
function literal(text: string): string {
  return text.replace(
    PUNCTUATION,
    (character) => `&#${character.charCodeAt(0)};`
  );
}

/** A bare URL as a Markdown link, so it renders like Chat's links (with their preview). */
function urlLink(url: string): string {
  const href = (url.startsWith('www.') ? `https://${url}` : url)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29');
  return `[${literal(url)}](${href})`;
}
const MARKDOWN_FOR: Record<string, string> = { '*': '**', _: '*', '~': '~~' };

function plainText(text: string): string {
  return literal(text);
}

/**
 * Characters a code span may hold. The importer neither decodes nor
 * transforms inside a code span, so it must hold nothing a Macro tag, link,
 * citation or equation could start with.
 */
const SAFE_CODE = /^[\p{L}\p{N}\s.,;?'"()+\-=/#%@^{}|]+$/u;

/**
 * `` `code` `` as a code span when that is safe and will form (not beside
 * another span's backtick); otherwise as literal text.
 */
function inlineCode(code: string, before: string, after: string | undefined) {
  const content = code.slice(1, -1);
  if (SAFE_CODE.test(content) && !before.endsWith('`') && after !== '`')
    return code;
  return literal(code);
}

function whatsappInline(text: string): string {
  let out = '';
  let last = 0;
  for (const found of text.matchAll(WHATSAPP_INLINE)) {
    const [whole, code, url, before = '', marker = '', inner = ''] = found;
    out += plainText(text.slice(last, found.index));
    last = found.index + whole.length;
    if (code !== undefined) out += inlineCode(code, out, text[last]);
    else if (url !== undefined) out += urlLink(url);
    else {
      const markdown = MARKDOWN_FOR[marker] ?? '';
      out += `${plainText(before)}${markdown}${whatsappInline(inner)}${markdown}`;
    }
  }
  return out + plainText(text.slice(last));
}

/** WhatsApp's line formats: `- ` / `* ` bullets, `1. ` numbers and `> ` quotes. */
const WHATSAPP_LINE = /^(?:([-*]) |(\d{1,9})\. |> ?)/;

function whatsappLine(line: string): string {
  const block = WHATSAPP_LINE.exec(line);
  if (!block) return whatsappInline(line);
  const rest = whatsappInline(line.slice(block[0].length));
  if (block[1]) return `- ${rest}`;
  if (block[2]) return `${block[2]}. ${rest}`;
  return `> ${rest}`;
}

/**
 * A received WhatsApp body as Markdown for the shared message renderer.
 * Only what this function writes is Markdown: WhatsApp's own formatting and
 * links for bare http(s) URLs. Everything else is literal text.
 */
export function whatsappToMarkdown(text: string): string {
  return text
    .split(/(```[\s\S]*?```)/)
    .map((part) =>
      part.startsWith('```') && part.endsWith('```') && part.length >= 6
        ? `\n\`\`\`\n${part.slice(3, -3).replace(/^\n|\n$/g, '')}\n\`\`\`\n`
        : part.split('\n').map(whatsappLine).join('\n')
    )
    .join('')
    .trim();
}
