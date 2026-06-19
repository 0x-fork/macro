import { describe, expect, it } from 'vitest';
import { firstEmojiRun, isEmojiOnly, splitEmojiRuns } from './string';

describe('isEmojiOnly', () => {
  it('returns true for single emoji', () => {
    expect(isEmojiOnly('🎉')).toBe(true);
    expect(isEmojiOnly('👍')).toBe(true);
    expect(isEmojiOnly('❤️')).toBe(true);
  });

  it('returns true for multiple emojis', () => {
    expect(isEmojiOnly('🎉🎊🎈')).toBe(true);
    expect(isEmojiOnly('👍👍👍')).toBe(true);
  });

  it('returns true for emojis with spaces', () => {
    expect(isEmojiOnly('🎉 🎊 🎈')).toBe(true);
    expect(isEmojiOnly('  🎉  ')).toBe(true);
  });

  it('returns true for composite emojis (ZWJ sequences)', () => {
    expect(isEmojiOnly('👨‍👩‍👧‍👦')).toBe(true); // family emoji
    expect(isEmojiOnly('👩‍💻')).toBe(true); // woman technologist
  });

  it('returns true for flag emojis', () => {
    expect(isEmojiOnly('🇺🇸')).toBe(true);
    expect(isEmojiOnly('🇬🇧')).toBe(true);
  });

  it('returns true for skin tone variants', () => {
    expect(isEmojiOnly('👍🏻')).toBe(true);
    expect(isEmojiOnly('👍🏿')).toBe(true);
  });

  it('returns false for text with emojis', () => {
    expect(isEmojiOnly('Hello 👋')).toBe(false);
    expect(isEmojiOnly('🎉 party!')).toBe(false);
    expect(isEmojiOnly('Great job 👍')).toBe(false);
  });

  it('returns false for plain text', () => {
    expect(isEmojiOnly('Hello')).toBe(false);
    expect(isEmojiOnly('hello world')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isEmojiOnly('')).toBe(false);
    expect(isEmojiOnly('   ')).toBe(false);
  });

  it('returns false for numbers', () => {
    expect(isEmojiOnly('123')).toBe(false);
    expect(isEmojiOnly('🎉 123')).toBe(false);
  });

  it('returns false for punctuation', () => {
    expect(isEmojiOnly('!')).toBe(false);
    expect(isEmojiOnly('🎉!')).toBe(false);
  });
});

describe('splitEmojiRuns', () => {
  const rejoin = (text: string) =>
    splitEmojiRuns(text)
      .map((s) => s.text)
      .join('');

  it('separates emoji from surrounding text', () => {
    expect(splitEmojiRuns('Hi 👋 there')).toEqual([
      { text: 'Hi ', isEmoji: false },
      { text: '👋', isEmoji: true },
      { text: ' there', isEmoji: false },
    ]);
  });

  it('handles leading and trailing emoji', () => {
    expect(splitEmojiRuns('🎉 party')).toEqual([
      { text: '🎉', isEmoji: true },
      { text: ' party', isEmoji: false },
    ]);
    expect(splitEmojiRuns('great job 👍')).toEqual([
      { text: 'great job ', isEmoji: false },
      { text: '👍', isEmoji: true },
    ]);
  });

  it('groups adjacent emoji into a single run', () => {
    expect(splitEmojiRuns('👍👍👍')).toEqual([
      { text: '👍👍👍', isEmoji: true },
    ]);
  });

  it('keeps composite, skin-tone, and flag emoji intact', () => {
    expect(splitEmojiRuns('👨‍👩‍👧‍👦')).toEqual([
      { text: '👨‍👩‍👧‍👦', isEmoji: true },
    ]);
    expect(splitEmojiRuns('👍🏿')).toEqual([{ text: '👍🏿', isEmoji: true }]);
    expect(splitEmojiRuns('🇺🇸')).toEqual([{ text: '🇺🇸', isEmoji: true }]);
  });

  it('returns a single text run when there is no emoji', () => {
    expect(splitEmojiRuns('hello world')).toEqual([
      { text: 'hello world', isEmoji: false },
    ]);
  });

  it('does not treat standalone variation selectors or joiners as emoji', () => {
    expect(splitEmojiRuns('\uFE0F')).toEqual([
      { text: '\uFE0F', isEmoji: false },
    ]);
    expect(splitEmojiRuns('\u200D')).toEqual([
      { text: '\u200D', isEmoji: false },
    ]);
  });

  it('returns nothing for an empty string', () => {
    expect(splitEmojiRuns('')).toEqual([]);
  });

  it('preserves the original content when rejoined', () => {
    expect(rejoin('Hi 👋 there 🎉🎊!')).toBe('Hi 👋 there 🎉🎊!');
    expect(rejoin('👨‍👩‍👧‍👦 family time 👍🏿')).toBe(
      '👨‍👩‍👧‍👦 family time 👍🏿'
    );
  });
});

describe('firstEmojiRun', () => {
  it('returns the offsets of the first emoji run', () => {
    expect(firstEmojiRun('🎉 party')).toEqual({ start: 0, end: 2 });
    // 'Hi ' is 3 UTF-16 units; the emoji occupies the next 2.
    expect(firstEmojiRun('Hi 👋 there')).toEqual({ start: 3, end: 5 });
  });

  it('matches only the first run, leaving later emoji alone', () => {
    expect(firstEmojiRun('a 👍 b 🎉')).toEqual({ start: 2, end: 4 });
  });

  it('keeps a composite emoji within a single run', () => {
    const match = firstEmojiRun('👨‍👩‍👧‍👦 x');
    expect(match?.start).toBe(0);
    expect('👨‍👩‍👧‍👦 x'.slice(match?.start, match?.end)).toBe('👨‍👩‍👧‍👦');
  });

  it('returns null when there is no emoji', () => {
    expect(firstEmojiRun('hello world')).toBeNull();
    expect(firstEmojiRun('')).toBeNull();
  });

  it('returns null for standalone variation selectors or joiners', () => {
    expect(firstEmojiRun('\uFE0F')).toBeNull();
    expect(firstEmojiRun('\u200D')).toBeNull();
  });

  it('is stateless across calls (non-global regex)', () => {
    expect(firstEmojiRun('🎉')).toEqual({ start: 0, end: 2 });
    expect(firstEmojiRun('🎉')).toEqual({ start: 0, end: 2 });
  });
});
