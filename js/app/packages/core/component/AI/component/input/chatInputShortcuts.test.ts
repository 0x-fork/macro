import { describe, expect, test } from 'vitest';
import { isBackgroundSendShortcut } from './chatInputShortcuts';

describe('isBackgroundSendShortcut', () => {
  test('returns true for cmd+shift+enter', () => {
    const event = {
      shiftKey: true,
      metaKey: true,
      ctrlKey: false,
    } as KeyboardEvent;

    expect(isBackgroundSendShortcut(event)).toBe(true);
  });

  test('returns true for ctrl+shift+enter', () => {
    const event = {
      shiftKey: true,
      metaKey: false,
      ctrlKey: true,
    } as KeyboardEvent;

    expect(isBackgroundSendShortcut(event)).toBe(true);
  });

  test('returns false when shift is missing', () => {
    const event = {
      shiftKey: false,
      metaKey: true,
      ctrlKey: false,
    } as KeyboardEvent;

    expect(isBackgroundSendShortcut(event)).toBe(false);
  });
});
