/** truncates a string to a given length
 * if the string required truncation, it will append an ellipsis
 * @param str - the string to truncate
 * @param maxLength - the maximum length of the string
 * @returns the truncated string
 *
 * @example
 * truncate('Hello World', 10); // 'Hello...'
 */
export function truncateString(str: string, maxLength: number) {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

const DEFAULT_LABEL_MAX_CHARS = 30;

/**
 * Truncates a display label to a max character count, appending a single
 * ellipsis character (`…`). Used for chip labels, display names, and other
 * UI labels where character-based truncation is preferred over CSS truncation.
 */
export function truncateLabel(raw: string, max = DEFAULT_LABEL_MAX_CHARS) {
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

let encoder: TextEncoder;
/**
 * Encodes a string to UTF-8 bytes
 * @param text - the string to encode
 * @returns the UTF-8 encoded bytes
 */
export function utf8Encode(text: string) {
  if (!encoder) encoder = new TextEncoder();
  return encoder.encode(text);
}

let decoder: TextDecoder;
/**
 * Decodes a array buffer to a string
 */
export function bufToString(buf: ArrayBuffer) {
  if (!decoder) decoder = new TextDecoder();
  return decoder.decode(buf);
}

/**
 * Pluralize a string if the `length` is great than 1
 */
export function plural(singular: string, length: number, suffix = 's') {
  if (!singular.length) return singular;

  if (length === 1) return singular;

  return `${singular}${suffix}`;
}

/**
 * Regex pattern to match emoji-only strings.
 * Uses alternation to match:
 * - Extended pictographic characters (most emojis)
 * - Emoji presentation characters
 * - Variation selectors (\uFE0F)
 * - Zero-width joiners (\u200D) for composite emojis (e.g., family emoji)
 * - Whitespace
 */
const EMOJI_ONLY_REGEX =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F|\u200D|\s)+$/u;

/**
 * Checks if a string contains only emoji characters (and whitespace).
 * Returns true for messages like "🎉", "👍👍👍", "🎊 🎉", etc.
 * Returns false for messages with any text, links, or other content.
 *
 * @param text - the string to check
 * @returns true if the string contains only emojis (and whitespace)
 *
 * @example
 * isEmojiOnly('🎉'); // true
 * isEmojiOnly('👨\u200D👩\u200D👧\u200D👦'); // true (family emoji)
 * isEmojiOnly('Hello 👋'); // false
 * isEmojiOnly(''); // false
 */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  return EMOJI_ONLY_REGEX.test(trimmed);
}

/**
 * Matches runs of consecutive emoji sequences. A run must start with an emoji
 * base character; variation selectors, skin-tone modifiers, and ZWJs only
 * attach to a base rather than matching on their own. Adjacent sequences (e.g.
 * "👍👍", flags, ZWJ families) stay within a single run.
 */
const EMOJI_BASE_PATTERN =
  '(?:\\p{Extended_Pictographic}|\\p{Emoji_Presentation})';
const EMOJI_SEQUENCE_PATTERN = `${EMOJI_BASE_PATTERN}(?:\\uFE0F|\\p{Emoji_Modifier}|\\u200D${EMOJI_BASE_PATTERN}(?:\\uFE0F|\\p{Emoji_Modifier})*)*`;
const EMOJI_RUN_PATTERN = `${EMOJI_SEQUENCE_PATTERN}(?:${EMOJI_SEQUENCE_PATTERN})*`;
const EMOJI_RUN_REGEX = new RegExp(EMOJI_RUN_PATTERN, 'gu');
const FIRST_EMOJI_RUN_REGEX = new RegExp(EMOJI_RUN_PATTERN, 'u');

/** A run of text tagged as either emoji or non-emoji. */
export type TextSegment = { text: string; isEmoji: boolean };

/**
 * Splits a string into alternating non-emoji and emoji runs, preserving order
 * and content (concatenating every `text` reproduces the input). Useful for
 * styling inline emoji differently from the surrounding text.
 *
 * @example
 * splitEmojiRuns('Hi 👋 there');
 * // [{text:'Hi ',isEmoji:false},{text:'👋',isEmoji:true},{text:' there',isEmoji:false}]
 */
export function splitEmojiRuns(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(EMOJI_RUN_REGEX)) {
    const start = match.index ?? lastIndex;
    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), isEmoji: false });
    }
    segments.push({ text: match[0], isEmoji: true });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isEmoji: false });
  }
  return segments;
}

/**
 * Returns the start/end offsets of the first emoji run in `text`, or null if
 * there is none. Shaped for Lexical's `registerLexicalTextEntity` `getMatch`.
 */
export function firstEmojiRun(
  text: string
): { start: number; end: number } | null {
  const match = FIRST_EMOJI_RUN_REGEX.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}
