import type {
  TableData,
  TableFilter,
  GroupByObj,
} from '@app/component/next-unified-list/table/types';
import {
  type ColumnDef,
  createSolidTable,
  type ExpandedState,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getGroupedRowModel,
  getSortedRowModel,
} from '@tanstack/solid-table';
import { createSignal, createMemo, type Accessor } from 'solid-js';

type SortColumn<TData extends TableData> = { id: keyof TData; desc: boolean };

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

    for (const option of sort()) {
      columnsList.push({
        id: option.id.toString(),
        sortingFn: 'datetime',
      });
    }

    return columnsList;
  });

  const sortingState = createMemo(() => {
    return sort().map((s) => ({ id: s.id.toString(), desc: s.desc }));
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
    onSortingChange: setSort,
    onExpandedChange: setExpanded,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    onGlobalFilterChange: setGlobalFilter,
    enableGlobalFilter: true,
    globalFilterFn: (row, _, filterValue: TableFilter<TData>[]) => {
      return filterValue.every((f) => f.predicate(row.original, row));
    },
    getRowId: (r) => r.id,
  });

  const navigateBy = (offset: number) => {
    const currentFocused = focusedRowID();

    if (!currentFocused) {
      return navigateTo(0);
    }

    const rowIndex = table
      .getRowModel()
      .rows.findIndex((r) => r.id === currentFocused);

    if (rowIndex === -1) {
      return navigateTo(0);
    }

    const total = table.getRowCount();

    if (total === 0) return;

    let next = rowIndex + offset;

    if (next > total - 1) {
      next = options.wrapNavigation ? 0 : total - 1;
    } else if (next < 0) {
      next = options.wrapNavigation ? total - 1 : 0;
    }

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
    setSort,
  };
};

export type TableController<TData extends TableData> = ReturnType<
  typeof createTableController<TData>
>;
