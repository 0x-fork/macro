import type {
  TableData,
  TableFilter,
  GroupByObj,
} from '@app/component/next-unified-list/table/types';
import {
  type ColumnDef,
  createSolidTable,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
} from '@tanstack/solid-table';
import { createSignal, createMemo, type Accessor } from 'solid-js';

type SortColumn<TData extends TableData> = {
  id: keyof TData | (string & {});
  sortingFn: (a: TData, b: TData) => number;
  desc?: boolean;
};

export interface TableControllerOptions<
  TData extends TableData,
  TFilter extends TableFilter<TData>,
> {
  initialState?: {
    filters?: TFilter[];
    groupBy?: GroupByObj<TData>[];
    sort?: SortColumn<TData>[];
    focusedRow?: TData['id'];
    selection?: Record<TData['id'], boolean>;
  };
  wrapNavigation?: boolean;
  disableFiltering?: boolean;
  onNavigate?: (next: TData['id'], index: number) => void;
}

export const createTableController = <
  TData extends TableData,
  TFilter extends TableFilter<TData> = TableFilter<TData>,
>(
  options: TableControllerOptions<TData, TFilter> & { data: Accessor<TData[]> }
) => {
  // Sorting state
  const [sort, setSort] = createSignal<SortColumn<TData>[]>(
    options.initialState?.sort ?? []
  );

  // Grouping
  const [grouping, setGrouping] = createSignal<GroupByObj<TData>[]>(
    options.initialState?.groupBy ?? []
  );

  // Row selection
  const [rowSelection, setRowSelection] = createSignal<Record<string, boolean>>(
    options.initialState?.selection ?? {}
  );

  // Global filter
  const [globalFilter, setGlobalFilter] = createSignal<TFilter[]>(
    options.initialState?.filters ?? []
  );

  const [focusedRowID, setFocusedRowID] = createSignal<TData['id'] | undefined>(
    options.initialState?.focusedRow
  );

  const columns = createMemo(() => {
    const columnsList: ColumnDef<TData>[] = [
      {
        accessorKey: 'id',
        sortingFn: (a, b) => {
          const value = sort().reduce(
            (_, c) => c.sortingFn(a.original, b.original),
            0
          );

          return value;
        },
      },
    ];

    for (const group of grouping()) {
      columnsList.push({
        id: group.id.toString(),
        accessorFn: group.getValue,
        getGroupingValue: group.getValue,
      });
    }

    return columnsList;
  });

  const [sortingState, setSortingState] = createSignal([
    { id: 'id', desc: true },
  ]);

  const table = createSolidTable({
    get data() {
      return options.data();
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
        return sortingState();
      },
      get rowSelection() {
        return rowSelection();
      },
      get grouping() {
        return grouping().map((g) => g.id.toString());
      },
      get globalFilter() {
        return globalFilter();
      },
    },
    manualFiltering: options.disableFiltering,
    onSortingChange: setSort,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    onGlobalFilterChange: setGlobalFilter,
    enableGlobalFilter: true,
    globalFilterFn: (row, _, filterValue: TableFilter<TData>[]) => {
      return filterValue.every((f) => f.predicate(row.original, row));
    },
    getRowId: (r) => r.id,
  });

  const getRowDataIndex = (rowID: string) => {
    const rowIndex = table.getRowModel().rows.findIndex((r) => r.id === rowID);

    return rowIndex;
  };

  const calculateNavigationIndex = (index: number, offset: number) => {
    const total = table.getRowCount();

    if (total === 0) return 0;

    let next = index + offset;

    if (next > total - 1) {
      next = options.wrapNavigation ? 0 : total - 1;
    } else if (next < 0) {
      next = options.wrapNavigation ? total - 1 : 0;
    }

    return next;
  };

  const navigateBy = (offset: number) => {
    const currentFocused = focusedRowID();

    if (!currentFocused) {
      return navigateTo(0);
    }

    const rowIndex = getRowDataIndex(currentFocused);

    if (rowIndex === -1) {
      return navigateTo(0);
    }

    const next = calculateNavigationIndex(rowIndex, offset);

    const nextRow = table.getRowModel().rows[next];

    if (nextRow) {
      options.onNavigate?.(nextRow.id, next);
    }

    setFocusedRowID(nextRow?.id);

    return nextRow ? { id: nextRow.id, index: next } : undefined;
  };

  const navigateTo = (index: number) => {
    const nextRow = table.getRowModel().rows[index];

    setFocusedRowID(nextRow?.id);

    return nextRow ? { id: nextRow.id, index } : undefined;
  };

  const navigateDown = () => {
    return navigateBy(1);
  };

  const navigateUp = () => {
    return navigateBy(-1);
  };

  return {
    table,
    getRowDataIndex,
    calculateNavigationIndex,
    navigateDown,
    navigateUp,
    navigateBy,
    navigateTo,
    focusedRowID,
    focusRow: (rowID: string) => setFocusedRowID(rowID),
    filters: globalFilter,
    setFilters: (filters: TFilter[]) => {
      setGlobalFilter(filters);
    },
    setGroupBy: (grouping: GroupByObj<TData>[]) => {
      setGrouping(grouping);
    },
    setSort: (sort: SortColumn<TData>[]) => {
      setSortingState((p) => [...p]);
      setSort(sort);
    },
  };
};

export type TableController<TData extends TableData> = ReturnType<
  typeof createTableController<TData>
>;
