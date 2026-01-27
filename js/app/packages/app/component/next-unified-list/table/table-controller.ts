import type {
  TableData,
  TableFilter,
  GroupByObj,
} from '@app/component/next-unified-list/table/types';
import {
  type ColumnDef,
  type ColumnSort,
  createSolidTable,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
} from '@tanstack/solid-table';
import { createSignal, createMemo, type Accessor } from 'solid-js';

export interface TableControllerOptions<
  TData extends TableData,
  TFilter extends TableFilter<TData>,
> {
  initialState?: {
    filters?: TFilter[];
    groupBy?: GroupByObj<TData>[];
    sort?: ColumnSort[];
    focusedRow?: TData['id'];
    selection?: Record<TData['id'], boolean>;
  };
  onNavigate?: (next: TData['id'], index: number) => void;
}

export const createTableController = <
  TData extends TableData,
  TFilter extends TableFilter<TData> = TableFilter<TData>,
>(
  options: TableControllerOptions<TData, TFilter> & { data: Accessor<TData[]> }
) => {
  // Sorting state
  const [sortingState, setSortingState] = createSignal<ColumnSort[]>(
    options.initialState?.sort ?? []
  );

  // Expanded state for groups
  const [expanded, setExpanded] = createSignal<ExpandedState>(true); // Start all expanded

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
    const columnsList: ColumnDef<TData>[] = [{ accessorKey: 'id' }];

    for (const group of grouping()) {
      columnsList.push({
        id: group.id.toString(),
        accessorFn: group.getValue,
        getGroupingValue: group.getValue,
      });
    }

    return columnsList;
  });

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
      get expanded() {
        return expanded();
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
    onSortingChange: setSortingState,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    onGlobalFilterChange: setGlobalFilter,
    enableGlobalFilter: true,
    globalFilterFn: (row, _, filterValue: TableFilter<TData>[]) => {
      return filterValue.every((f) => f.predicate(row.original, row));
    },
  });

  const navigateBy = (offset: number) => {
    const currentFocused = focusedRowID();

    if (!currentFocused) {
      // TODO: Focus first or last
      return;
    }

    const row = table.getRow(currentFocused);

    const total = table.getRowCount();

    if (total === 0) return;

    let next = row.index + offset;

    if (next > total) {
      next = 0;
    } else if (next < 0) {
      next = total - 1;
    }

    const nextRow = table.getRowModel().flatRows[next];

    if (nextRow) {
      options.onNavigate?.(nextRow.id, next);
    }

    setFocusedRowID(nextRow?.id);

    // TODO: Auto scroll
  };

  const navigateDown = () => {
    navigateBy(1);
  };

  const navigateUp = () => {
    navigateBy(-1);
  };

  return {
    table,
    navigateDown,
    navigateUp,
    navigateBy,
    focusedRowID,
    focusRow: (rowID: string) => setFocusedRowID(rowID),
    filters: globalFilter,
    setFilters: (filters: TFilter[]) => {
      setGlobalFilter(filters);
    },
    setGroupBy: (grouping: GroupByObj<TData>[]) => {
      setGrouping(grouping);
    },
  };
};

export type TableController<TData extends TableData> = ReturnType<
  typeof createTableController<TData>
>;
