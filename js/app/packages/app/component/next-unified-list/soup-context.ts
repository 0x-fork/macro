import { createFilterState } from '@app/component/next-unified-list/filters';
import {
  type FilterConfig,
  SOUP_FILTERS,
} from '@app/component/next-unified-list/filters/filters';
import type { ListFilterConfig } from '@app/component/next-unified-list/list-state';
import { createSelectionState } from '@app/component/next-unified-list/selection-state';
import type { EntityData, WithSearch } from '@macro-entity';
import {
  type ColumnDef,
  createSolidTable,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
} from '@tanstack/solid-table';
import { createMemo, createSignal } from 'solid-js';

type SoupEntity = EntityData | WithSearch<EntityData>;

export type GroupConfig<T> = {
  id: string;
  getValue: (item: T) => unknown;
};

export type SortConfig<T> = {
  id: string;
  fn: (a: T, b: T) => number;
  desc?: boolean;
};

export type NavigationResult<T> = { item: T; index: number } | undefined;

interface SoupContextOptions {
  initialData?: SoupEntity[];
  wrapNavigation?: boolean;
}

export const createSoupState = (
  { wrapNavigation, initialData }: SoupContextOptions = {
    wrapNavigation: false,
  }
) => {
  const selection = createSelectionState<SoupEntity>({
    getItemId: (i) => i.id,
  });

  const filters = createFilterState<SoupEntity, FilterConfig<SoupEntity>>({
    filters: SOUP_FILTERS,
  });

  const [sort, setSort] = createSignal<SortConfig<SoupEntity>[]>([]);

  const [groups, setGroups] = createSignal<GroupConfig<SoupEntity>[]>([]);

  const [data, setDataInternal] = createSignal<SoupEntity[]>(initialData ?? []);

  const setData = (newData: SoupEntity[]) => {
    setDataInternal(newData);
  };

  const [previewEntity, setPreviewEntity] = createSignal<string | undefined>();

  const [focusedId, setFocusedId] = createSignal<string | undefined>();

  // Build columns dynamically based on grouping
  const columns = createMemo(() => {
    const cols: ColumnDef<SoupEntity>[] = [
      {
        id: '__id__',
        accessorKey: 'id',
        sortingFn: (a, b) => {
          for (const s of sort()) {
            const result = s.fn(a.original, b.original);
            if (result !== 0) return s.desc ? -result : result;
          }
          return 0;
        },
      },
    ];

    for (const group of groups()) {
      cols.push({
        id: group.id,
        accessorFn: group.getValue,
        getGroupingValue: group.getValue,
      });
    }

    return cols;
  });

  // TanStack Table instance
  const table = createSolidTable({
    get data() {
      return data();
    },
    get columns() {
      return columns();
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    state: {
      get sorting() {
        return [{ id: '__id__', desc: sort()[0]?.desc ?? true }];
      },
      get grouping() {
        return groups().map((g) => g.id);
      },
      get globalFilter() {
        return filters.active();
      },
    },
    enableGlobalFilter: true,
    globalFilterFn: (row, _, filterValue: ListFilterConfig<SoupEntity>[]) => {
      return filterValue.every((f) => f.predicate(row.original, row));
    },
    getRowId: (row) => row.id,
  });

  // Derived state
  const rows = createMemo(() => table.getRowModel().rows);
  const count = createMemo(() => rows().length);

  const indexOf = (id: string): number => rows().findIndex((r) => r.id === id);

  const focusedIndex = createMemo(() => {
    const id = focusedId();
    if (!id) return -1;
    return indexOf(id);
  });

  const focused = createMemo(() => {
    const index = focusedIndex();
    if (index === -1) return undefined;
    return rows()[index]?.original;
  });

  const getItem = (id: string): SoupEntity | undefined =>
    table.getRow(id)?.original;

  const getItemAt = (index: number): SoupEntity | undefined =>
    rows()[index]?.original;

  // Navigation implementation
  const setFocus = (index: number): NavigationResult<SoupEntity> => {
    const visibleRows = rows();
    if (visibleRows.length === 0) return undefined;

    let targetIndex = index;
    if (targetIndex < 0) {
      targetIndex = wrapNavigation ? visibleRows.length - 1 : 0;
    } else if (targetIndex >= visibleRows.length) {
      targetIndex = wrapNavigation ? 0 : visibleRows.length - 1;
    }

    const row = visibleRows[targetIndex];
    if (!row) return undefined;

    setFocusedId(row.id);
    return { item: row.original, index: targetIndex };
  };

  const navigateBy = (offset: number): NavigationResult<SoupEntity> => {
    const current = focusedIndex();
    if (current === -1) {
      return setFocus(offset > 0 ? 0 : rows().length - 1);
    }
    return setFocus(current + offset);
  };

  const clearFocus = () => {
    setFocusedId(undefined);
  };

  return {
    data,
    setData,
    filters,
    selection,
    sort,
    setSort,
    groups,
    setGroups,

    focus: {
      item: focused,
      id: focusedId,
      index: focusedIndex,
      clear: clearFocus,
    },

    navigate: {
      down: () => navigateBy(1),
      up: () => navigateBy(-1),
      by: navigateBy,
      toIndex: setFocus,
      toId: (id: string) => {
        const index = indexOf(id);
        if (index === -1) return undefined;
        return setFocus(index);
      },
      toFirst: () => setFocus(0),
      toLast: () => setFocus(rows().length - 1),
      peekOffset: (offset: number) => {
        const current = focusedIndex();
        const next = navigateBy(offset);
        setFocus(current);
        return next;
      },
    },

    items: {
      rows,
      count,
      get: getItem,
      at: getItemAt,
      indexOf,
    },

    previewEntity,
    setPreviewEntity,

    __table: table,
  };
};

export type SoupState = ReturnType<typeof createSoupState>;
