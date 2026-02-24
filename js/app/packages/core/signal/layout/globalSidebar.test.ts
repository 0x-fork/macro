import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import {
  getPinnedItemByShortcutIndex,
  setSidebarPinnedItems,
} from './globalSidebar';

describe('globalSidebar pin shortcuts', () => {
  it('maps shortcut index to ordered pinned items', () => {
    createRoot((dispose) => {
      setSidebarPinnedItems([
        { kind: 'view', id: 'home', label: 'Home' },
        { kind: 'view', id: 'inbox', label: 'Inbox' },
      ]);

      const firstPinned = getPinnedItemByShortcutIndex(1);
      const secondPinned = getPinnedItemByShortcutIndex(2);

      expect(firstPinned?.kind).toBe('view');
      expect(firstPinned && firstPinned.kind === 'view' ? firstPinned.id : undefined).toBe(
        'home'
      );
      expect(secondPinned && secondPinned.kind === 'view' ? secondPinned.id : undefined).toBe(
        'inbox'
      );
      expect(getPinnedItemByShortcutIndex(3)).toBeUndefined();

      dispose();
    });
  });
});
