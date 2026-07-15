import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createListState } from './create-list-state';

type Item = { id: string; navigable?: boolean; selectable?: boolean };

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id }));

describe('createListState', () => {
  describe('navigation', () => {
    it('steps down and up through items', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({
          initialItems: items('a', 'b', 'c'),
        });

        expect(list.navigate.down()?.item.id).toBe('a');
        expect(list.navigate.down()?.item.id).toBe('b');
        expect(list.navigate.up()?.item.id).toBe('a');
        expect(list.focus.id()).toBe('a');

        dispose();
      });
    });

    it('clamps at the ends by default', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({ initialItems: items('a', 'b') });

        list.navigate.toId('b');
        expect(list.navigate.down()?.item.id).toBe('b');

        dispose();
      });
    });

    it('wraps when wrapNavigation is set', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          wrapNavigation: true,
        });

        list.navigate.toId('b');
        expect(list.navigate.down()?.item.id).toBe('a');

        dispose();
      });
    });

    it('skips non-navigable items', () => {
      createRoot((dispose) => {
        const data: Item[] = [
          { id: 'a' },
          { id: 'skip', navigable: false },
          { id: 'c' },
        ];
        const list = createListState<Item>({
          initialItems: data,
          isNavigable: (item) => item.navigable !== false,
        });

        list.navigate.toId('a');
        expect(list.navigate.down()?.item.id).toBe('c');

        dispose();
      });
    });

    it('uses navigable items for first and last navigation', () => {
      createRoot((dispose) => {
        const data: Item[] = [
          { id: 'header', navigable: false },
          { id: 'a' },
          { id: 'footer', navigable: false },
        ];
        const list = createListState<Item>({
          initialItems: data,
          isNavigable: (item) => item.navigable !== false,
        });

        expect(list.navigate.toFirst()?.item.id).toBe('a');
        list.focus.clear();
        expect(list.navigate.toLast()?.item.id).toBe('a');

        dispose();
      });
    });

    it('does not loop forever when wrapping with no navigable items', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({
          initialItems: [{ id: 'a', navigable: false }],
          isNavigable: (item) => item.navigable !== false,
          wrapNavigation: true,
        });

        expect(list.navigate.down()).toBeUndefined();
        expect(list.focus.index()).toBe(-1);

        dispose();
      });
    });
  });

  describe('focus persistence', () => {
    it('keeps focus on the same item id across setItems', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({
          initialItems: items('a', 'b', 'c'),
        });

        list.navigate.toId('b');
        expect(list.focus.index()).toBe(1);

        // 'b' moves to index 2 after a reorder/insert.
        list.items.set(items('x', 'a', 'b'));
        expect(list.focus.id()).toBe('b');
        expect(list.focus.index()).toBe(2);

        dispose();
      });
    });

    it('clears focus when the focused item disappears', () => {
      createRoot((dispose) => {
        const seen: Array<string | undefined> = [];
        const reasons: string[] = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          onFocusChange: (r, event) => {
            seen.push(r?.item.id);
            reasons.push(event.reason);
          },
        });

        list.navigate.toId('b');
        list.items.set(items('a', 'c'));
        expect(list.focus.index()).toBe(-1);
        expect(list.focus.id()).toBeUndefined();
        expect(seen).toEqual(['b', undefined]);
        expect(reasons).toEqual(['keyboard', 'items']);

        dispose();
      });
    });

    it('restores focus with fallback', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({ initialItems: items('a', 'b') });

        expect(
          list.focus.restore('missing', { fallback: 'first' })?.item.id
        ).toBe('a');
        expect(list.focus.id()).toBe('a');

        dispose();
      });
    });
  });

  describe('suppressFocus', () => {
    it('does not move focus while suppressed', () => {
      createRoot((dispose) => {
        const reasons: string[] = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          suppressFocus: (attempt) => {
            reasons.push(attempt.reason);
            return true;
          },
        });

        expect(list.navigate.down()).toBeUndefined();
        expect(list.focus.index()).toBe(-1);
        expect(reasons).toEqual(['keyboard']);

        dispose();
      });
    });
  });

  describe('selection', () => {
    it('reports selectable items via isSelectable', () => {
      createRoot((dispose) => {
        const data: Item[] = [
          { id: 'a', selectable: true },
          { id: 'b', selectable: false },
        ];
        const list = createListState<Item>({
          initialItems: data,
          isSelectable: (item) => item.selectable !== false,
        });

        expect(list.selection.isSelectable(data[0])).toBe(true);
        expect(list.selection.isSelectable(data[1])).toBe(false);

        list.selection.select(data[1]);
        list.selection.toggle(data[1]);
        list.selection.selectRange(data);
        expect(list.selection.selected()).toEqual([data[0]]);

        list.selection.set([data[1]]);
        expect(list.selection.selected()).toEqual([]);

        dispose();
      });
    });

    it('tracks selected items via the selection state', () => {
      createRoot((dispose) => {
        const data = items('a', 'b', 'c');
        const list = createListState<Item>({ initialItems: data });

        list.selection.select(data[2]);
        list.selection.select(data[0]);
        expect(list.selection.selected().map((i) => i.id)).toEqual(['c', 'a']);

        dispose();
      });
    });

    it('refreshes selected item payloads when items are replaced', () => {
      createRoot((dispose) => {
        const original = { id: 'a', label: 'old' };
        const replacement = { id: 'a', label: 'new' };
        const list = createListState({ initialItems: [original] });

        list.selection.select(original);
        list.items.set([replacement]);

        expect(list.selection.get('a')).toBe(replacement);
        dispose();
      });
    });
  });

  describe('zero-offset navigation', () => {
    it('does not create focus when no item is focused', () => {
      createRoot((dispose) => {
        const list = createListState<Item>({ initialItems: items('a', 'b') });

        expect(list.navigate.by(0)).toBeUndefined();
        expect(list.navigate.peekOffset(0)).toBeUndefined();
        expect(list.focus.id()).toBeUndefined();

        dispose();
      });
    });
  });

  describe('onFocusChange', () => {
    it('fires on navigation with the focused result and reason', () => {
      createRoot((dispose) => {
        const seen: Array<string | undefined> = [];
        const reasons: string[] = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b', 'c'),
          onFocusChange: (r, event) => {
            seen.push(r?.item.id);
            reasons.push(event.reason);
          },
        });

        list.navigate.down(); // -> a
        list.navigate.down(); // -> b
        list.focus.set('c', { reason: 'hover' });
        expect(seen).toEqual(['a', 'b', 'c']);
        expect(reasons).toEqual(['keyboard', 'keyboard', 'hover']);

        dispose();
      });
    });

    it('does not fire when focus index is unchanged (boundary)', () => {
      createRoot((dispose) => {
        const seen: Array<string | undefined> = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          onFocusChange: (r) => seen.push(r?.item.id),
        });

        list.navigate.toId('b');
        list.navigate.down(); // clamped at 'b' -> no change
        expect(seen).toEqual(['b']);

        dispose();
      });
    });

    it('fires undefined on clear', () => {
      createRoot((dispose) => {
        const seen: Array<string | undefined> = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          onFocusChange: (r) => seen.push(r?.item.id),
        });

        list.navigate.toId('a');
        list.focus.clear();
        expect(seen).toEqual(['a', undefined]);

        dispose();
      });
    });

    it('does not fire when a list update merely re-pins focus', () => {
      createRoot((dispose) => {
        const seen: Array<string | undefined> = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b', 'c'),
          onFocusChange: (r) => seen.push(r?.item.id),
        });

        list.navigate.toId('b');
        list.items.set(items('x', 'a', 'b')); // 'b' still focused, new index
        expect(seen).toEqual(['b']);
        expect(list.focus.index()).toBe(2);

        dispose();
      });
    });
  });

  describe('focus options', () => {
    it('does not focus non-navigable items unless forced', () => {
      createRoot((dispose) => {
        const data: Item[] = [{ id: 'header', navigable: false }, { id: 'a' }];
        const list = createListState<Item>({
          initialItems: data,
          isNavigable: (item) => item.navigable !== false,
        });

        expect(list.focus.set('header')).toBeUndefined();
        expect(list.focus.id()).toBeUndefined();
        expect(list.focus.set('header', { force: true })?.item.id).toBe(
          'header'
        );

        dispose();
      });
    });
  });

  describe('activation', () => {
    it('activates the current item without moving focus', () => {
      createRoot((dispose) => {
        const activations: string[] = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          onActivate: ({ item, reason }) =>
            activations.push(`${reason}:${item.id}`),
        });

        list.navigate.toId('a');
        expect(list.activate.current({ reason: 'keyboard' })?.item.id).toBe(
          'a'
        );
        expect(activations).toEqual(['keyboard:a']);
        expect(list.focus.id()).toBe('a');

        dispose();
      });
    });

    it('activates by id and focuses the target by default', () => {
      createRoot((dispose) => {
        const seen: Array<string | undefined> = [];
        const activations: string[] = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          onFocusChange: (r) => seen.push(r?.item.id),
          onActivate: ({ item, reason }) =>
            activations.push(`${reason}:${item.id}`),
        });

        expect(list.activate.id('b', { reason: 'pointer' })?.item.id).toBe('b');
        expect(list.focus.id()).toBe('b');
        expect(seen).toEqual(['b']);
        expect(activations).toEqual(['pointer:b']);

        dispose();
      });
    });

    it('can activate without focusing', () => {
      createRoot((dispose) => {
        const activations: string[] = [];
        const list = createListState<Item>({
          initialItems: items('a', 'b'),
          onActivate: ({ item }) => activations.push(item.id),
        });

        list.activate.id('b', { focus: false });
        expect(list.focus.id()).toBeUndefined();
        expect(activations).toEqual(['b']);

        dispose();
      });
    });
  });
});
