import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createListState } from '../create-list-state';
import { createStaticListDataSource } from '../create-static-data-source';

type Item = {
  id: string;
  value: string;
};

describe('createListState data source ownership', () => {
  it('reads items directly from the registered data source', () => {
    const fixture = createRoot((dispose) => {
      const [items, setItems] = createSignal<readonly Item[]>([
        { id: 'a', value: 'A' },
      ]);
      const list = createListState({
        dataSource: createStaticListDataSource(items),
      });
      return { dispose, items, list, setItems };
    });

    expect(fixture.list.items.all()).toBe(fixture.items());

    fixture.setItems([{ id: 'b', value: 'B' }]);

    expect(fixture.list.items.all()).toBe(fixture.items());
    expect(fixture.list.items.get('b')?.value).toBe('B');
    fixture.dispose();
  });

  it('tracks focus by occurrence id while deriving its current index', () => {
    const first = { id: 'group-a:entity', value: 'first occurrence' };
    const second = { id: 'group-b:entity', value: 'second occurrence' };
    const fixture = createRoot((dispose) => {
      const [items, setItems] = createSignal<readonly Item[]>([first, second]);
      const list = createListState({
        dataSource: createStaticListDataSource(items),
      });
      return { dispose, list, setItems };
    });

    fixture.list.focus.set(second.id);
    expect(fixture.list.focus.id()).toBe(second.id);
    expect(fixture.list.focus.index()).toBe(1);

    fixture.setItems([second, first]);
    expect(fixture.list.focus.id()).toBe(second.id);
    expect(fixture.list.focus.index()).toBe(0);

    fixture.setItems([first]);
    expect(fixture.list.focus.id()).toBeUndefined();
    expect(fixture.list.focus.index()).toBe(-1);

    fixture.setItems([first, second]);
    expect(fixture.list.focus.id()).toBeUndefined();
    fixture.dispose();
  });

  it('clears focus and selection when a different data source is registered', () => {
    const firstItem = { id: 'first', value: 'First' };
    const secondItem = { id: 'second', value: 'Second' };
    const fixture = createRoot((dispose) => {
      const firstSource = createStaticListDataSource(() => [firstItem]);
      const secondSource = createStaticListDataSource(() => [secondItem]);
      const list = createListState({ dataSource: firstSource });
      return { dispose, list, secondSource };
    });

    fixture.list.focus.set(firstItem.id);
    fixture.list.selection.select(firstItem);
    fixture.list.setDataSource(fixture.secondSource);

    expect(fixture.list.focus.id()).toBeUndefined();
    expect(fixture.list.selection.selected()).toEqual([]);
    expect(fixture.list.items.all()).toEqual([secondItem]);
    fixture.dispose();
  });

  it('peeks multiple navigable offsets while focus is unset', () => {
    const fixture = createRoot((dispose) => {
      const list = createListState({
        dataSource: createStaticListDataSource(() => [
          { id: 'header', value: 'Header' },
          { id: 'a', value: 'A' },
          { id: 'hidden', value: 'Hidden' },
          { id: 'b', value: 'B' },
        ]),
        isNavigable: (item) => item.id !== 'hidden',
      });
      return { dispose, list };
    });

    expect(fixture.list.navigate.peekOffset(1)?.item.id).toBe('header');
    expect(fixture.list.navigate.peekOffset(2)?.item.id).toBe('a');
    expect(fixture.list.navigate.peekOffset(3)?.item.id).toBe('b');
    expect(fixture.list.navigate.peekOffset(-2)?.item.id).toBe('a');
    expect(fixture.list.focus.id()).toBeUndefined();
    fixture.dispose();
  });

  it('refreshes selected item payloads without duplicating item state', () => {
    const initial = { id: 'item', value: 'Initial' };
    const replacement = { id: 'item', value: 'Replacement' };
    const fixture = createRoot((dispose) => {
      const [items, setItems] = createSignal<readonly Item[]>([initial]);
      const list = createListState({
        dataSource: createStaticListDataSource(items),
      });
      return { dispose, list, setItems };
    });

    fixture.list.selection.select(initial);
    fixture.setItems([replacement]);

    expect(fixture.list.selection.selected()).toEqual([replacement]);
    fixture.dispose();
  });
});
