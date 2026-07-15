import { describe, expect, it } from 'vitest';
import {
  bracketObject,
  findCharInLine,
  firstNonBlank,
  lineBoundsAt,
  matchBracket,
  nextWordStart,
  prevWordStart,
  quoteObject,
  toggleCase,
  wordEnd,
  wordObject,
} from './textMotions';

describe('nextWordStart (w/W)', () => {
  //           0123456789012345678
  const text = 'foo bar-baz  qux';

  it('moves to the next word start', () => {
    expect(nextWordStart(text, 0, false)).toBe(4); // foo| -> bar
  });

  it('treats punctuation as its own word', () => {
    expect(nextWordStart(text, 4, false)).toBe(7); // bar| -> -
    expect(nextWordStart(text, 7, false)).toBe(8); // -| -> baz
  });

  it('W skips punctuation runs', () => {
    expect(nextWordStart(text, 4, true)).toBe(13); // bar-baz| -> qux
  });

  it('skips multiple blanks', () => {
    expect(nextWordStart(text, 8, false)).toBe(13);
  });

  it('starting on a blank lands on the next run', () => {
    expect(nextWordStart(text, 3, false)).toBe(4);
  });

  it('clamps at end of text', () => {
    expect(nextWordStart(text, 13, false)).toBe(text.length);
    expect(nextWordStart('', 0, false)).toBe(0);
  });

  it('treats newlines as whitespace', () => {
    expect(nextWordStart('ab\ncd', 0, false)).toBe(3);
  });
});

describe('wordEnd (e/E)', () => {
  const text = 'foo bar-baz  qux';

  it('moves to end of current word when inside it', () => {
    expect(wordEnd(text, 0, false)).toBe(2); // f|oo -> foo|
  });

  it('moves to end of the next word when already at an end', () => {
    expect(wordEnd(text, 2, false)).toBe(6); // foo| -> bar|
  });

  it('E treats bar-baz as one WORD', () => {
    expect(wordEnd(text, 3, true)).toBe(10);
  });

  it('stays at last char at end of text', () => {
    expect(wordEnd(text, 15, false)).toBe(15);
  });
});

describe('prevWordStart (b/B)', () => {
  const text = 'foo bar-baz  qux';

  it('moves back to start of previous word', () => {
    expect(prevWordStart(text, 13, false)).toBe(8); // |qux -> baz
  });

  it('moves to start of current word when inside it', () => {
    expect(prevWordStart(text, 5, false)).toBe(4);
  });

  it('B jumps over the whole WORD', () => {
    expect(prevWordStart(text, 13, true)).toBe(4);
  });

  it('clamps at start', () => {
    expect(prevWordStart(text, 0, false)).toBe(0);
  });
});

describe('firstNonBlank (^)', () => {
  it('finds the first non-blank char', () => {
    expect(firstNonBlank('   abc', 0, 6)).toBe(3);
  });
  it('returns start when line is all blanks', () => {
    expect(firstNonBlank('    ', 0, 4)).toBe(0);
  });
});

describe('findCharInLine (f/F/t/T)', () => {
  //           0123456789
  const text = 'abcabcabc';

  it('f finds forward', () => {
    expect(findCharInLine(text, 0, 0, 9, 'f', 'c', 1)).toBe(2);
  });
  it('f with count', () => {
    expect(findCharInLine(text, 0, 0, 9, 'f', 'c', 2)).toBe(5);
  });
  it('F searches backward', () => {
    expect(findCharInLine(text, 8, 0, 9, 'F', 'a', 1)).toBe(6);
  });
  it('t stops before the target', () => {
    expect(findCharInLine(text, 0, 0, 9, 't', 'c', 1)).toBe(1);
  });
  it('a fresh t may land in place when parked before the target', () => {
    expect(findCharInLine(text, 1, 0, 9, 't', 'c', 1)).toBe(1);
  });
  it('a repeated t (skipAdjacent) moves past the parked target', () => {
    // cursor at 1 (parked before c at 2) — `;` goes before c at 5
    expect(findCharInLine(text, 1, 0, 9, 't', 'c', 1, true)).toBe(4);
  });
  it('T stops after the target searching backwards', () => {
    expect(findCharInLine(text, 8, 0, 9, 'T', 'a', 1)).toBe(7);
  });
  it('returns null when not found', () => {
    expect(findCharInLine(text, 0, 0, 9, 'f', 'z', 1)).toBeNull();
  });
  it('respects line bounds', () => {
    expect(findCharInLine('ab\ncd', 0, 0, 2, 'f', 'c', 1)).toBeNull();
  });
});

describe('matchBracket (%)', () => {
  it('jumps from opener to closer', () => {
    expect(matchBracket('a(b(c)d)e', 1, 9)).toBe(7);
  });
  it('jumps from closer to opener', () => {
    expect(matchBracket('a(b(c)d)e', 7, 9)).toBe(1);
  });
  it('scans forward on the line to the first bracket', () => {
    expect(matchBracket('ab(cd)', 0, 6)).toBe(5);
  });
  it('handles nesting', () => {
    expect(matchBracket('((x))', 0, 5)).toBe(4);
  });
  it('returns null when there is no bracket', () => {
    expect(matchBracket('abc', 0, 3)).toBeNull();
  });
});

describe('wordObject (iw/aw)', () => {
  const text = 'foo  bar baz';

  it('iw selects the word under the cursor', () => {
    expect(wordObject(text, 6, false, false)).toEqual({ start: 5, end: 8 });
  });
  it('iw on whitespace selects the whitespace run', () => {
    expect(wordObject(text, 3, false, false)).toEqual({ start: 3, end: 5 });
  });
  it('aw extends over trailing blanks', () => {
    expect(wordObject(text, 6, false, true)).toEqual({ start: 5, end: 9 });
  });
  it('aw takes leading blanks when there are no trailing ones', () => {
    expect(wordObject(text, 10, false, true)).toEqual({ start: 8, end: 12 });
  });
  it('returns null for empty text', () => {
    expect(wordObject('', 0, false, false)).toBeNull();
  });
});

describe('quoteObject (i"/a")', () => {
  //           0123456789012345
  const text = 'say "hi" or "yo"';

  it('i" selects inside the quotes', () => {
    expect(quoteObject(text, 6, 0, text.length, '"', false)).toEqual({
      start: 5,
      end: 7,
    });
  });
  it('finds the pair ahead of the cursor', () => {
    expect(quoteObject(text, 0, 0, text.length, '"', false)).toEqual({
      start: 5,
      end: 7,
    });
  });
  it('a" includes quotes and trailing space', () => {
    expect(quoteObject(text, 6, 0, text.length, '"', true)).toEqual({
      start: 4,
      end: 9,
    });
  });
  it('selects the second pair when cursor is past the first', () => {
    expect(quoteObject(text, 13, 0, text.length, '"', false)).toEqual({
      start: 13,
      end: 15,
    });
  });
  it('returns null without a complete pair', () => {
    expect(quoteObject('a "b', 0, 0, 4, '"', false)).toBeNull();
  });
});

describe('bracketObject (i(/a()', () => {
  //           01234567890
  const text = 'a (b [c] d)';

  it('i( selects inside the parens', () => {
    expect(bracketObject(text, 5, '(', false)).toEqual({ start: 3, end: 10 });
  });
  it('a( includes the parens', () => {
    expect(bracketObject(text, 5, '(', true)).toEqual({ start: 2, end: 11 });
  });
  it('inner bracket pair wins for its own kind', () => {
    expect(bracketObject(text, 6, '[', false)).toEqual({ start: 6, end: 7 });
  });
  it('works when sitting on the opener', () => {
    expect(bracketObject(text, 2, '(', false)).toEqual({ start: 3, end: 10 });
  });
  it('handles nested same-kind pairs', () => {
    expect(bracketObject('((x))', 2, '(', false)).toEqual({ start: 2, end: 3 });
  });
  it('returns null when not enclosed', () => {
    expect(bracketObject('abc', 1, '(', false)).toBeNull();
  });
});

describe('lineBoundsAt', () => {
  it('finds soft-line bounds inside a block', () => {
    expect(lineBoundsAt('ab\ncde\nf', 4)).toEqual({ start: 3, end: 6 });
  });
  it('handles the first and last lines', () => {
    expect(lineBoundsAt('ab\ncde', 0)).toEqual({ start: 0, end: 2 });
    expect(lineBoundsAt('ab\ncde', 5)).toEqual({ start: 3, end: 6 });
  });
});

describe('toggleCase', () => {
  it('swaps case per character', () => {
    expect(toggleCase('aBc1!')).toBe('AbC1!');
  });
});
