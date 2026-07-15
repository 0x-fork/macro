/**
 * @file Pure string-scanning primitives for vim motions and text objects.
 *
 * All functions operate on a flattened block string (see LineContext in
 * `types.ts`) and return flat offsets. They never touch Lexical or the DOM,
 * which keeps vim's fiddly word/WORD/text-object semantics unit-testable.
 *
 * Character classes follow vim: a "word" is a run of alphanumerics plus `_`,
 * OR a run of other non-blank characters (punctuation); a "WORD" is any run
 * of non-blanks. `\n` (soft line breaks in a block) counts as whitespace.
 */

const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
const isBlank = (ch: string) => ch === ' ' || ch === '\t' || ch === '\n';

/** vim char class: 0 = blank, 1 = word, 2 = punctuation. */
function charClass(ch: string, big: boolean): number {
  if (isBlank(ch)) return 0;
  if (big) return 1;
  return isWordChar(ch) ? 1 : 2;
}

/** Clamp `n` into `[lo, hi]`. */
export const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

/** Start offset of the next word after `pos` (vim `w` / `W`). */
export function nextWordStart(text: string, pos: number, big: boolean): number {
  const n = text.length;
  if (pos >= n) return n;
  let i = pos;
  const cls = charClass(text[i]!, big);
  // Skip the rest of the current run (if we're on a non-blank).
  if (cls !== 0) {
    while (i < n && charClass(text[i]!, big) === cls) i++;
  }
  // Skip blanks to the start of the next run.
  while (i < n && charClass(text[i]!, big) === 0) i++;
  return i;
}

/** End offset (index of last char) of the word at/after `pos` (vim `e`/`E`). */
export function wordEnd(text: string, pos: number, big: boolean): number {
  const n = text.length;
  let i = pos + 1;
  if (i >= n) return n > 0 ? n - 1 : 0;
  // Skip blanks.
  while (i < n && charClass(text[i]!, big) === 0) i++;
  if (i >= n) return n - 1;
  const cls = charClass(text[i]!, big);
  while (i + 1 < n && charClass(text[i + 1]!, big) === cls) i++;
  return i;
}

/** Start offset of the previous word before `pos` (vim `b` / `B`). */
export function prevWordStart(text: string, pos: number, big: boolean): number {
  let i = pos - 1;
  if (i < 0) return 0;
  // Skip blanks backwards.
  while (i >= 0 && charClass(text[i]!, big) === 0) i--;
  if (i < 0) return 0;
  const cls = charClass(text[i]!, big);
  while (i - 1 >= 0 && charClass(text[i - 1]!, big) === cls) i--;
  return i;
}

/** First non-blank offset in `[start, end)` (vim `^`); `start` if all blank. */
export function firstNonBlank(text: string, start: number, end: number) {
  let i = start;
  while (i < end && isBlank(text[i]!)) i++;
  return i === end ? start : i;
}

/**
 * Find a character on the current line (vim `f`/`F`/`t`/`T`).
 * Returns the target cursor offset or null when not found.
 *
 * `skipAdjacent` implements the `;` repeat rule: a repeated `t`/`T` must be
 * able to move past the char it is already parked next to, while a fresh
 * `t`/`T` may legitimately not move at all.
 */
export function findCharInLine(
  text: string,
  cursor: number,
  lineStart: number,
  lineEnd: number,
  kind: 'f' | 'F' | 't' | 'T',
  char: string,
  count: number,
  skipAdjacent = false
): number | null {
  const forward = kind === 'f' || kind === 't';
  const till = kind === 't' || kind === 'T';
  let i = cursor;
  for (let found = 0; found < count; found++) {
    let from = forward ? i + 1 : i - 1;
    if (till && skipAdjacent && found === 0) {
      if (forward && text[from] === char) from++;
      else if (!forward && from >= lineStart && text[from] === char) from--;
    }
    let hit = -1;
    if (forward) {
      for (let j = from; j < lineEnd; j++) {
        if (text[j] === char) {
          hit = j;
          break;
        }
      }
    } else {
      for (let j = from; j >= lineStart; j--) {
        if (text[j] === char) {
          hit = j;
          break;
        }
      }
    }
    if (hit === -1) return null;
    i = hit;
  }
  return till ? (forward ? i - 1 : i + 1) : i;
}

/** Matching pairs for `%` and bracket text objects. */
const BRACKET_PAIRS: Record<string, { open: string; close: string }> = {
  '(': { open: '(', close: ')' },
  ')': { open: '(', close: ')' },
  b: { open: '(', close: ')' },
  '[': { open: '[', close: ']' },
  ']': { open: '[', close: ']' },
  '{': { open: '{', close: '}' },
  '}': { open: '{', close: '}' },
  B: { open: '{', close: '}' },
  '<': { open: '<', close: '>' },
  '>': { open: '<', close: '>' },
};

/**
 * vim `%`: from `pos`, scan forward on the line for the first bracket, then
 * jump to its match (searching the whole block). Returns null when nothing
 * matches.
 */
export function matchBracket(
  text: string,
  pos: number,
  lineEnd: number
): number | null {
  const openers = '([{';
  const closers = ')]}';
  let i = pos;
  while (
    i < lineEnd &&
    !openers.includes(text[i]!) &&
    !closers.includes(text[i]!)
  )
    i++;
  if (i >= lineEnd) return null;
  const ch = text[i]!;
  const isOpen = openers.includes(ch);
  const open = isOpen ? ch : openers[closers.indexOf(ch)]!;
  const close = isOpen ? closers[openers.indexOf(ch)]! : ch;
  let depth = 0;
  if (isOpen) {
    for (let j = i; j < text.length; j++) {
      if (text[j] === open) depth++;
      else if (text[j] === close) {
        depth--;
        if (depth === 0) return j;
      }
    }
  } else {
    for (let j = i; j >= 0; j--) {
      if (text[j] === close) depth++;
      else if (text[j] === open) {
        depth--;
        if (depth === 0) return j;
      }
    }
  }
  return null;
}

/** An inclusive-exclusive flat range `[start, end)`. */
export type FlatRange = { start: number; end: number };

/**
 * Word text object (`iw`/`aw`/`iW`/`aW`).
 * `around` extends over trailing blanks (or leading ones when there are no
 * trailing blanks), like vim's `aw`.
 */
export function wordObject(
  text: string,
  pos: number,
  big: boolean,
  around: boolean
): FlatRange | null {
  const n = text.length;
  if (n === 0) return null;
  const p = clamp(pos, 0, n - 1);
  const cls = charClass(text[p]!, big);
  let start = p;
  let end = p + 1;
  while (start > 0 && charClass(text[start - 1]!, big) === cls) start--;
  while (end < n && charClass(text[end]!, big) === cls) end++;
  if (!around) return { start, end };
  let aEnd = end;
  while (aEnd < n && charClass(text[aEnd]!, big) === 0) aEnd++;
  if (aEnd === end) {
    // No trailing blanks — take leading ones instead (vim behavior).
    while (start > 0 && charClass(text[start - 1]!, big) === 0) start--;
  }
  return { start, end: aEnd };
}

/**
 * Quote text object (`i"`, `a'`, …) on the current line. vim looks at the
 * line only, pairing quotes from the line start; the cursor must be on or
 * before the closing quote.
 */
export function quoteObject(
  text: string,
  pos: number,
  lineStart: number,
  lineEnd: number,
  quote: string,
  around: boolean
): FlatRange | null {
  const hits: number[] = [];
  for (let i = lineStart; i < lineEnd; i++) {
    if (text[i] === quote) hits.push(i);
  }
  for (let k = 0; k + 1 < hits.length; k += 2) {
    const open = hits[k]!;
    const close = hits[k + 1]!;
    if (pos <= close) {
      if (!around) return { start: open + 1, end: close };
      // `a"` includes the quotes plus trailing whitespace (or leading).
      let end = close + 1;
      let start = open;
      let ateTrailing = false;
      while (end < lineEnd && text[end] === ' ') {
        end++;
        ateTrailing = true;
      }
      if (!ateTrailing) {
        while (start > lineStart && text[start - 1] === ' ') start--;
      }
      return { start, end };
    }
  }
  return null;
}

/**
 * Bracket text object (`i(`, `a[`, `iB`, …) searched across the whole block.
 * Finds the innermost pair enclosing the cursor.
 */
export function bracketObject(
  text: string,
  pos: number,
  bracketKey: string,
  around: boolean
): FlatRange | null {
  const pair = BRACKET_PAIRS[bracketKey];
  if (!pair) return null;
  const { open, close } = pair;
  const n = text.length;
  const p = clamp(pos, 0, Math.max(0, n - 1));

  // Scan left for the innermost unmatched opener (count from cursor).
  let depth = 0;
  let openIdx = -1;
  // When sitting on the opener/closer itself, vim still matches that pair.
  if (text[p] === open) {
    openIdx = p;
  } else {
    for (let i = p; i >= 0; i--) {
      const ch = text[i];
      if (ch === close && i !== p) depth++;
      else if (ch === open) {
        if (depth === 0) {
          openIdx = i;
          break;
        }
        depth--;
      }
    }
  }
  if (openIdx === -1) return null;

  depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < n; i++) {
    const ch = text[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1 || closeIdx < p) return null;
  return around
    ? { start: openIdx, end: closeIdx + 1 }
    : { start: openIdx + 1, end: closeIdx };
}

/** Bounds `[start, end)` of the soft line containing `pos`. */
export function lineBoundsAt(
  text: string,
  pos: number
): { start: number; end: number } {
  let start = pos;
  while (start > 0 && text[start - 1] !== '\n') start--;
  let end = pos;
  while (end < text.length && text[end] !== '\n') end++;
  return { start, end };
}

/** Toggle the case of every cased character in `s` (vim `~`). */
export function toggleCase(s: string): string {
  let out = '';
  for (const ch of s) {
    const lower = ch.toLowerCase();
    out += ch === lower ? ch.toUpperCase() : lower;
  }
  return out;
}
