import { type Accessor, createMemo, createSignal } from 'solid-js';
import { createSelectionState, type Identifiable } from './selection-state';

export type ListNavigationResult<T> = { item: T; index: number } | undefined;

export type ListFocusReason =
  | 'keyboard'
  | 'hover'
  | 'pointer'
  | 'restore'
  | 'items'
  | 'programmatic';

export type ListFocusOptions = {
  reason?: ListFocusReason;
  /** Allow direct focus to bypass `isNavigable`. Defaults to false. */
  force?: boolean;
};

export type ListFocusFallback = 'none' | 'first' | 'last' | 'nearest';

export type ListRestoreFocusOptions = ListFocusOptions & {
  fallback?: ListFocusFallback;
  /** Index to use as the center point when `fallback` is `nearest`. */
  nearestIndex?: number;
};

export type ListFocusChange<T> = {
  current: ListNavigationResult<T>;
  previous: ListNavigationResult<T>;
  reason: ListFocusReason;
};

export type ListFocusAttempt<T> = {
  target: ListNavigationResult<T>;
  previous: ListNavigationResult<T>;
  reason: ListFocusReason;
};

export type ListActivationReason = 'keyboard' | 'pointer' | 'programmatic';

export type ListActivation<T> = {
  item: T;
  index: number;
  reason: ListActivationReason;
  metadata?: unknown;
};

export type ListActivateOptions = {
  reason?: ListActivationReason;
  /**
   * Whether to focus the target before invoking it. Defaults to true for
   * `id`/`index` activation and false for `current` activation.
   */
  focus?: boolean | ListFocusOptions;
  metadata?: unknown;
};

export type CreateListStateOptions<T extends Identifiable> = {
  initialItems?: T[];
  /** Whether keyboard navigation may land on an item. Defaults to always. */
  isNavigable?: (item: T) => boolean;
  /** Whether an item may participate in selection. Defaults to always. */
  isSelectable?: (item: T) => boolean;
  /** Wrap focus around the ends instead of clamping. */
  wrapNavigation?: boolean;
  /**
   * When it returns true, focus changes are suppressed (e.g. touch devices,
   * where keyboard focus has no meaning). Defaults to never suppressing. Kept
   * injectable so the core stays free of any environment coupling.
   */
  suppressFocus?: (attempt: ListFocusAttempt<T>) => boolean;
  /**
   * Called when the focused item changes (including to none). The generic core
   * has no view; consumers wire this to scroll the focused item into view.
   * Not fired when a list update merely re-pins focus to the same item.
   */
  onFocusChange?: (
    focused: ListNavigationResult<T>,
    change: ListFocusChange<T>
  ) => void;
  /** Called when the consumer invokes/opens/commits an item. */
  onActivate?: (activation: ListActivation<T>) => void;
};

const focusReasonForActivation = (
  reason: ListActivationReason
): ListFocusReason => {
  switch (reason) {
    case 'keyboard':
      return 'keyboard';
    case 'pointer':
      return 'pointer';
    case 'programmatic':
      return 'programmatic';
  }
};

/**
 * Generic list interaction primitive. An item is anything with an `id`; the
 * list owns items, focus, keyboard navigation, activation, and selection — and
 * deliberately nothing else (no rendering, opening, grouping, or domain
 * concepts). Those are expressed by the caller through the item type and the
 * navigable/selectable predicates.
 */
export const createListState = <T extends Identifiable>(
  options: CreateListStateOptions<T> = {}
) => {
  const {
    initialItems = [],
    isNavigable = () => true,
    isSelectable = () => true,
    wrapNavigation = false,
    suppressFocus = () => false,
    onFocusChange,
    onActivate,
  } = options;

  const [items, setItemsInternal] = createSignal<T[]>(initialItems);
  const [focusedIndex, setFocusedIndex] = createSignal(-1);
  let lastFocusedItemId: string | undefined;

  const selection = createSelectionState<T>();

  const itemAt = (index: number) => items()[index];

  const resultAt = (index: number): ListNavigationResult<T> => {
    if (index < 0) return;

    const item = itemAt(index);
    if (!item) return;

    return { item, index };
  };

  const currentFocusResult = (): ListNavigationResult<T> =>
    resultAt(focusedIndex());

  const notifyFocus = (
    current: ListNavigationResult<T>,
    previous: ListNavigationResult<T>,
    reason: ListFocusReason
  ) => {
    onFocusChange?.(current, { current, previous, reason });
  };

  /** Single funnel for focus mutations so `onFocusChange` fires exactly once. */
  const commitFocus = (
    index: number,
    itemId: string | undefined,
    reason: ListFocusReason
  ) => {
    const previous = currentFocusResult();
    const current = index < 0 ? undefined : resultAt(index);
    const changed =
      previous?.index !== current?.index ||
      previous?.item.id !== current?.item.id;

    setFocusedIndex(index);
    lastFocusedItemId = current ? (itemId ?? current.item.id) : undefined;

    if (changed) notifyFocus(current, previous, reason);
  };

  const indexOf = (id: string) => items().findIndex((item) => item.id === id);

  const focusedItem = createMemo(() => currentFocusResult()?.item);

  const focusedId = createMemo(() => focusedItem()?.id);

  const canFocus = (item: T, focusOptions?: ListFocusOptions) =>
    focusOptions?.force === true || isNavigable(item);

  const findFocusableIndex = (
    startIndex: number,
    direction: 1 | -1,
    focusOptions?: ListFocusOptions
  ) => {
    const allItems = items();

    for (
      let index = startIndex;
      index >= 0 && index < allItems.length;
      index += direction
    ) {
      const item = allItems[index];
      if (item && canFocus(item, focusOptions)) return index;
    }

    return -1;
  };

  const findNearestFocusableIndex = (
    index: number,
    focusOptions?: ListFocusOptions
  ) => {
    const allItems = items();
    if (allItems.length === 0) return -1;

    const center = Math.min(Math.max(index, 0), allItems.length - 1);
    const centerItem = allItems[center];
    if (centerItem && canFocus(centerItem, focusOptions)) return center;

    for (let distance = 1; distance < allItems.length; distance++) {
      const after = center + distance;
      const before = center - distance;

      const afterItem = allItems[after];
      if (afterItem && canFocus(afterItem, focusOptions)) return after;

      const beforeItem = allItems[before];
      if (beforeItem && canFocus(beforeItem, focusOptions)) return before;
    }

    return -1;
  };

  const calculateFocusItem = (
    index: number,
    focusOptions?: ListFocusOptions
  ): ListNavigationResult<T> => {
    const allItems = items();
    if (allItems.length === 0) return;

    let targetIndex = index;
    if (targetIndex < 0) {
      targetIndex = wrapNavigation ? allItems.length - 1 : 0;
    } else if (targetIndex >= allItems.length) {
      targetIndex = wrapNavigation ? 0 : allItems.length - 1;
    }

    const item = allItems[targetIndex];
    if (!item || !canFocus(item, focusOptions)) return;

    return { item, index: targetIndex };
  };

  const setFocus = (
    index: number,
    focusOptions: ListFocusOptions = {}
  ): ListNavigationResult<T> => {
    const reason = focusOptions.reason ?? 'programmatic';
    const target = calculateFocusItem(index, focusOptions);
    if (!target) return;

    const previous = currentFocusResult();
    if (suppressFocus({ target, previous, reason })) return;

    commitFocus(target.index, target.item.id, reason);

    return target;
  };

  const focusFirst = (focusOptions: ListFocusOptions = {}) => {
    const index = findFocusableIndex(0, 1, focusOptions);
    if (index < 0) return;

    return setFocus(index, focusOptions);
  };

  const focusLast = (focusOptions: ListFocusOptions = {}) => {
    const index = findFocusableIndex(items().length - 1, -1, focusOptions);
    if (index < 0) return;

    return setFocus(index, focusOptions);
  };

  const focusNearest = (index: number, focusOptions: ListFocusOptions = {}) => {
    const nextIndex = findNearestFocusableIndex(index, focusOptions);
    if (nextIndex < 0) return;

    return setFocus(nextIndex, focusOptions);
  };

  const restoreFocus = (
    id: string | undefined,
    restoreOptions: ListRestoreFocusOptions = {}
  ) => {
    const reason = restoreOptions.reason ?? 'restore';
    const focusOptions = { ...restoreOptions, reason };

    if (id !== undefined) {
      const index = indexOf(id);
      if (index >= 0) {
        const restored = setFocus(index, focusOptions);
        if (restored) return restored;
      }
    }

    switch (restoreOptions.fallback ?? 'none') {
      case 'first':
        return focusFirst(focusOptions);
      case 'last':
        return focusLast(focusOptions);
      case 'nearest':
        return focusNearest(
          restoreOptions.nearestIndex ?? focusedIndex(),
          focusOptions
        );
      case 'none':
        commitFocus(-1, undefined, reason);
        return;
    }
  };

  const setItems = (nextItems: T[]) => {
    const previous = currentFocusResult();

    setItemsInternal(nextItems);

    const selected = selection.selected();

    if (selected.length) {
      // Refresh selected payloads when the source replaces an item object while
      // retaining its id. Selections that are temporarily absent remain selected
      // so consumers can decide when filters/search should clear them.
      const nextById = new Map(nextItems.map((item) => [item.id, item]));

      let selectionChanged = false;
      const reconciledSelection = selected.map((item) => {
        const next = nextById.get(item.id);
        if (next && next !== item) {
          selectionChanged = true;
          return next;
        }
        return item;
      });

      if (selectionChanged) selection.set(reconciledSelection);
    }

    // Keep focus pinned to the same item across list updates.
    if (!lastFocusedItemId) return;

    const nextIndex = nextItems.findIndex(
      (item) => item.id === lastFocusedItemId
    );

    if (nextIndex < 0) {
      setFocusedIndex(-1);
      lastFocusedItemId = undefined;
      notifyFocus(undefined, previous, 'items');
      return;
    }

    setFocusedIndex(nextIndex);
  };

  const findNextIndex = (startIndex: number, offset: number) => {
    const allItems = items();
    if (allItems.length === 0) return -1;
    if (offset === 0) return startIndex;

    const direction = offset > 0 ? 1 : -1;
    let steps = Math.abs(offset);
    let cursor = startIndex;
    let lastValid = canFocus(allItems[startIndex]) ? startIndex : -1;
    let iterations = 0;
    const maxIterations = allItems.length * steps;

    while (steps > 0 && iterations < maxIterations) {
      iterations++;
      cursor += direction;

      if (cursor < 0 || cursor >= allItems.length) {
        if (!wrapNavigation) break;
        cursor = (cursor + allItems.length) % allItems.length;
      }

      const item = allItems[cursor];
      if (!item) break;
      if (!canFocus(item)) continue;

      lastValid = cursor;
      steps--;
    }

    return lastValid;
  };

  const navigateBy = (
    offset: number,
    focusOptions: ListFocusOptions = {}
  ): ListNavigationResult<T> => {
    if (offset === 0) return currentFocusResult();

    const reason = focusOptions.reason ?? 'keyboard';
    const nextFocusOptions = { ...focusOptions, reason };
    const current = focusedIndex();

    if (current !== -1) {
      const nextIndex = findNextIndex(current, offset);
      if (nextIndex < 0) return;

      return setFocus(nextIndex, nextFocusOptions);
    }

    return offset > 0
      ? focusFirst(nextFocusOptions)
      : focusLast(nextFocusOptions);
  };

  const clearFocus = (focusOptions: ListFocusOptions = {}) =>
    commitFocus(-1, undefined, focusOptions.reason ?? 'programmatic');

  const activationFrom = (
    target: ListNavigationResult<T>,
    activateOptions: ListActivateOptions = {}
  ) => {
    if (!target) return;

    const reason = activateOptions.reason ?? 'programmatic';
    const activation: ListActivation<T> =
      activateOptions.metadata === undefined
        ? { item: target.item, index: target.index, reason }
        : {
            item: target.item,
            index: target.index,
            reason,
            metadata: activateOptions.metadata,
          };

    onActivate?.(activation);

    return activation;
  };

  const focusOptionsForActivation = (
    activateOptions: ListActivateOptions | undefined,
    defaultFocus: boolean
  ): ListFocusOptions | undefined => {
    const focus = activateOptions?.focus;
    if (focus === false) return;
    if (focus === undefined && !defaultFocus) return;

    const reason = focusReasonForActivation(
      activateOptions?.reason ?? 'programmatic'
    );

    if (focus === true || focus === undefined) return { reason };

    return { ...focus, reason: focus.reason ?? reason };
  };

  const activateIndex = (
    index: number,
    activateOptions: ListActivateOptions = {},
    defaultFocus = true
  ) => {
    const target = resultAt(index);
    if (!target) return;

    const focusOptions = focusOptionsForActivation(
      activateOptions,
      defaultFocus
    );
    if (focusOptions) setFocus(index, focusOptions);

    return activationFrom(target, activateOptions);
  };

  return {
    items: {
      all: items as Accessor<T[]>,
      set: setItems,
      count: () => items().length,
      get: (id: string) => items().find((item) => item.id === id),
      at: itemAt,
      indexOf,
    },
    focus: {
      item: focusedItem,
      id: focusedId,
      index: focusedIndex,
      clear: clearFocus,
      set: (id: string | undefined, focusOptions?: ListFocusOptions) => {
        if (id === undefined) return clearFocus(focusOptions);

        const index = indexOf(id);
        if (index < 0) return;

        return setFocus(index, focusOptions);
      },
      setIndex: (index: number, focusOptions?: ListFocusOptions) =>
        setFocus(index, focusOptions),
      first: focusFirst,
      last: focusLast,
      nearest: focusNearest,
      restore: restoreFocus,
    },
    navigate: {
      down: (focusOptions?: ListFocusOptions) => navigateBy(1, focusOptions),
      up: (focusOptions?: ListFocusOptions) => navigateBy(-1, focusOptions),
      by: navigateBy,
      toIndex: (index: number, focusOptions?: ListFocusOptions) =>
        setFocus(index, {
          ...focusOptions,
          reason: focusOptions?.reason ?? 'keyboard',
        }),
      toId: (id: string, focusOptions?: ListFocusOptions) => {
        const index = indexOf(id);
        if (index < 0) return;

        return setFocus(index, {
          ...focusOptions,
          reason: focusOptions?.reason ?? 'keyboard',
        });
      },
      toFirst: (focusOptions?: ListFocusOptions) =>
        focusFirst({
          ...focusOptions,
          reason: focusOptions?.reason ?? 'keyboard',
        }),
      toLast: (focusOptions?: ListFocusOptions) =>
        focusLast({
          ...focusOptions,
          reason: focusOptions?.reason ?? 'keyboard',
        }),
      peekOffset: (offset: number) => {
        const current = focusedIndex();
        if (offset === 0) return currentFocusResult();
        if (current === -1) {
          return offset > 0
            ? resultAt(findFocusableIndex(0, 1))
            : resultAt(findFocusableIndex(items().length - 1, -1));
        }

        const nextIndex = findNextIndex(current, offset);
        if (nextIndex < 0) return;

        return resultAt(nextIndex);
      },
    },
    activate: {
      current: (activateOptions?: ListActivateOptions) =>
        activateIndex(focusedIndex(), activateOptions, false),
      id: (id: string, activateOptions?: ListActivateOptions) => {
        const index = indexOf(id);
        if (index < 0) return;

        return activateIndex(index, activateOptions, true);
      },
      index: (index: number, activateOptions?: ListActivateOptions) =>
        activateIndex(index, activateOptions, true),
    },
    selection: {
      ...selection,
      isSelectable,
      select: (item: T) => {
        if (!isSelectable(item)) return;
        selection.select(item);
      },
      toggle: (item: T) => {
        if (!isSelectable(item)) return;
        selection.toggle(item);
      },
      selectRange: (nextItems: T[]) =>
        selection.selectRange(nextItems.filter(isSelectable)),
      set: (nextItems: T[]) => selection.set(nextItems.filter(isSelectable)),
    },
  };
};

export type ListState<T extends Identifiable> = ReturnType<
  typeof createListState<T>
>;
