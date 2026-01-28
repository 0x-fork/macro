/**
 * Selection State Primitive
 *
 * A reactive primitive for managing selection state with support for:
 * - Inclusive mode: explicit list of selected items
 * - Exclusive mode: "select all" with explicit exclusions (for infinite data)
 * - O(1) lookups and mutations via mutable Map/Set with version tracking
 */
import { createSignal, createMemo, batch, type Accessor } from 'solid-js';
/** Selection mode indicator */
export type SelectionModeType = 'inclusive' | 'exclusive';
/** Selection mode with data (used for snapshots/callbacks) */
export type SelectionMode<T> =
  | { type: 'inclusive'; items: Map<string, T> }
  | { type: 'exclusive'; excluded: Set<string> };
/** Options for creating selection state */
export type CreateSelectionStateOptions<T> = {
  /** Function to extract ID from item */
  getItemId: (item: T) => string;
  /** Initial selected items */
  initial?: T[];
  /** Callback when selection changes */
  onChange?: (selected: T[], mode: SelectionMode<T>) => void;
};
/** Selection state return type */
export type SelectionState<T> = {
  /** Currently selected items (empty array in exclusive mode) */
  readonly selected: Accessor<T[]>;
  /** Set of selected IDs (empty in exclusive mode) */
  readonly selectedIds: Accessor<Set<string>>;
  /** Check if item is selected */
  readonly isSelected: (id: string) => boolean;
  /** Get selected item by ID (only works in inclusive mode) */
  readonly getItem: (id: string) => T | undefined;
  /** Toggle item selection */
  readonly toggle: (item: T) => void;
  /** Add item to selection */
  readonly select: (item: T) => void;
  /** Remove item from selection */
  readonly deselect: (id: string) => void;
  /** Select multiple items */
  readonly selectRange: (items: T[], mode?: 'add' | 'replace') => void;
  /** Select all (switches to exclusive mode) */
  readonly selectAll: () => void;
  /** Clear all selections */
  readonly clear: () => void;
  /** Set selection directly */
  readonly set: (items: T[]) => void;
  /** Resolve exclusive mode to inclusive using full dataset */
  readonly resolveAll: (allItems: T[]) => void;
  /** Number of selected items (Infinity in exclusive mode) */
  readonly count: Accessor<number>;
  /** Whether in "select all" mode */
  readonly isAllSelected: Accessor<boolean>;
  /** Current selection mode */
  readonly mode: Accessor<SelectionModeType>;
};
/**
 * Creates reactive selection state.
 *
 * Supports two modes:
 * - **Inclusive**: Tracks explicit list of selected items. Use for normal selection.
 * - **Exclusive**: Tracks items excluded from "all". Use for "select all" with infinite data.
 *
 * @example
 * ```ts
 * const selection = createSelectionState({
 *   getItemId: (item) => item.id,
 *   onChange: (selected) => console.log('Selected:', selected.length),
 * });
 *
 * // Select items
 * selection.select(item1);
 * selection.toggle(item2);
 *
 * // Check selection
 * selection.isSelected(item1.id); // true
 *
 * // Select all (for infinite data)
 * selection.selectAll();
 * selection.isAllSelected(); // true
 * selection.isSelected(anyId); // true (unless excluded)
 *
 * // When full data is available, resolve to inclusive
 * selection.resolveAll(allLoadedItems);
 * */
export function createSelectionState<T>(
  options: CreateSelectionStateOptions<T>
): SelectionState<T> {
  const { getItemId, initial = [], onChange } = options;

  // Separate signals for mode and version (to trigger reactivity on mutations)
  const [modeType, setModeType] = createSignal<SelectionModeType>('inclusive');
  const [version, setVersion] = createSignal(0);

  // Mutable data structures (not in signals)
  const inclusiveItems = new Map<string, T>(
    initial.map((item) => [getItemId(item), item])
  );

  const excludedIds = new Set<string>();

  // Trigger reactivity after mutation
  const touch = () => setVersion((v) => v + 1);

  // Helper to get current mode snapshot (for onChange)
  const getModeSnapshot = (): SelectionMode<T> => {
    if (modeType() === 'exclusive') {
      return { type: 'exclusive', excluded: new Set(excludedIds) };
    }
    return { type: 'inclusive', items: new Map(inclusiveItems) };
  };

  // Notify onChange (creates snapshot only when needed)
  const notify = () => {
    if (!onChange) return;
    const sel =
      modeType() === 'inclusive' ? Array.from(inclusiveItems.values()) : [];
    onChange(sel, getModeSnapshot());
  };

  // Derived state - reads version to track mutations
  const selected = createMemo(() => {
    version(); // Subscribe to mutations
    if (modeType() === 'exclusive') return [];
    return Array.from(inclusiveItems.values());
  });

  const selectedIds = createMemo(() => {
    version();
    if (modeType() === 'exclusive') return new Set<string>();
    return new Set(inclusiveItems.keys());
  });

  const count = createMemo(() => {
    version();
    if (modeType() === 'exclusive') return Infinity;
    return inclusiveItems.size;
  });

  const isAllSelected = createMemo(() => modeType() === 'exclusive');

  // Methods
  const isSelected = (id: string): boolean => {
    version(); // Subscribe to mutations for reactivity
    if (modeType() === 'exclusive') {
      return !excludedIds.has(id);
    }
    return inclusiveItems.has(id);
  };

  const getItem = (id: string): T | undefined => {
    version();
    if (modeType() === 'exclusive') return undefined;
    return inclusiveItems.get(id);
  };

  const select = (item: T) => {
    const id = getItemId(item);
    if (modeType() === 'exclusive') {
      if (excludedIds.has(id)) {
        excludedIds.delete(id);
        touch();
        notify();
      }
    } else {
      if (!inclusiveItems.has(id)) {
        inclusiveItems.set(id, item);
        touch();
        notify();
      }
    }
  };

  const deselect = (id: string) => {
    if (modeType() === 'exclusive') {
      if (!excludedIds.has(id)) {
        excludedIds.add(id);
        touch();
        notify();
      }
    } else {
      if (inclusiveItems.has(id)) {
        inclusiveItems.delete(id);
        touch();
        notify();
      }
    }
  };

  const toggle = (item: T) => {
    const id = getItemId(item);
    if (isSelected(id)) {
      deselect(id);
    } else {
      select(item);
    }
  };

  const selectRange = (items: T[], rangeMode: 'add' | 'replace' = 'add') => {
    batch(() => {
      if (rangeMode === 'replace') {
        // Switch to inclusive, replace all
        inclusiveItems.clear();
        for (const item of items) {
          inclusiveItems.set(getItemId(item), item);
        }
        setModeType('inclusive');
      } else if (modeType() === 'exclusive') {
        // Remove from excluded
        for (const item of items) {
          excludedIds.delete(getItemId(item));
        }
      } else {
        // Add to inclusive
        for (const item of items) {
          inclusiveItems.set(getItemId(item), item);
        }
      }
      touch();
    });
    notify();
  };

  const selectAll = () => {
    batch(() => {
      excludedIds.clear();
      setModeType('exclusive');
      touch();
    });
    notify();
  };

  const clear = () => {
    batch(() => {
      inclusiveItems.clear();
      excludedIds.clear();
      setModeType('inclusive');
      touch();
    });
    notify();
  };

  const set = (items: T[]) => {
    batch(() => {
      inclusiveItems.clear();
      for (const item of items) {
        inclusiveItems.set(getItemId(item), item);
      }
      setModeType('inclusive');
      touch();
    });
    notify();
  };

  const resolveAll = (allItems: T[]) => {
    if (modeType() !== 'exclusive') return;
    batch(() => {
      inclusiveItems.clear();
      for (const item of allItems) {
        if (!excludedIds.has(getItemId(item))) {
          inclusiveItems.set(getItemId(item), item);
        }
      }
      excludedIds.clear();
      setModeType('inclusive');
      touch();
    });
    notify();
  };

  return {
    selected,
    selectedIds,
    isSelected,
    getItem,
    toggle,
    select,
    deselect,
    selectRange,
    selectAll,
    clear,
    set,
    resolveAll,
    count,
    isAllSelected,
    mode: modeType,
  };
}
