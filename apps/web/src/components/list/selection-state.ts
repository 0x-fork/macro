import { createMemo, createSignal } from 'solid-js';

/** The one and only requirement the generic list system places on an item. */
export type Identifiable = { id: string };

export type CreateSelectionOptions<T extends Identifiable> = {
  /** Initially selected items. */
  initial?: T[];
  onChange?: (selected: T[]) => void;
};

/**
 * Reactive selection state keyed on `item.id`. Knows nothing about what an item
 * is beyond its id.
 */
export const createSelectionState = <T extends Identifiable>(
  options: CreateSelectionOptions<T> = {}
) => {
  const { initial = [], onChange } = options;

  // Mutable map + invalidation signal for O(1) mutations with reactive reads.
  const items = new Map<string, T>(initial.map((item) => [item.id, item]));
  // Pure invalidation signal: `track()` subscribes, `touch()` always notifies.
  const [track, touch] = createSignal(undefined, { equals: false });

  const notify = () => onChange?.(Array.from(items.values()));

  const selected = createMemo(() => {
    track();
    return Array.from(items.values());
  });

  const selectedIds = createMemo(() => {
    track();
    return new Set(items.keys());
  });

  const count = createMemo(() => {
    track();
    return items.size;
  });

  const isSelected = (id: string) => selectedIds().has(id);

  const get = (id: string) => {
    track();
    return items.get(id);
  };

  const select = (item: T) => {
    if (items.has(item.id)) return;

    items.set(item.id, item);
    touch();
    notify();
  };

  const deselect = (id: string) => {
    if (!items.has(id)) return;

    items.delete(id);
    touch();
    notify();
  };

  const toggle = (item: T) => {
    if (items.has(item.id)) return deselect(item.id);

    select(item);
  };

  const selectRange = (newItems: T[]) => {
    let changed = false;

    for (const item of newItems) {
      if (items.has(item.id)) continue;

      items.set(item.id, item);
      changed = true;
    }

    if (!changed) return;

    touch();
    notify();
  };

  const set = (newItems: T[]) => {
    items.clear();

    for (const item of newItems) {
      items.set(item.id, item);
    }

    touch();
    notify();
  };

  const clear = () => {
    if (items.size === 0) return;

    items.clear();
    touch();
    notify();
  };

  return {
    selected,
    selectedIds,
    count,
    isSelected,
    get,
    toggle,
    select,
    deselect,
    selectRange,
    set,
    clear,
  };
};

export type SelectionState<T extends Identifiable> = ReturnType<
  typeof createSelectionState<T>
>;
