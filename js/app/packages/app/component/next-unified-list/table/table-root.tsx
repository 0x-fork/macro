import { TableContext } from '@app/component/next-unified-list/table/table-context';
import {
  createSolidTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getGroupedRowModel,
  getExpandedRowModel,
  type ColumnDef,
  type ColumnSort,
  type ExpandedState,
  type VisibilityState,
  type GroupingState,
  type Row,
} from '@tanstack/solid-table';
import { cn } from '@ui/utils/classname';
import { createMemo, createSignal, type FlowProps } from 'solid-js';

type TableData = { id: string };
type TableFilter<TData> = {
  id: string;
  predicate: (data: TData, row: Row<TData>) => boolean;
};

interface TableRootProps<
  TData extends TableData,
  TFilter extends TableFilter<TData>,
> {
  ref?: (el: HTMLElement) => void;
  class?: string;
  data: TData[];
  filters?: TFilter[];
  groupBy?: {
    id: keyof TData | (string & {});
    getValue: (row: TData) => any;
  }[];
  sort?: ColumnSort[];
}

export function TableRoot<
  TData extends TableData,
  TFilter extends TableFilter<TData>,
>(props: FlowProps<TableRootProps<TData, TFilter>>) {
  // Sorting state
  const [sortingState, setSortingState] = createSignal<ColumnSort[]>(
    props.sort ?? []
  );

  // Expanded state for groups
  const [expanded, setExpanded] = createSignal<ExpandedState>(true); // Start all expanded

  // Column visibility
  const [columnVisibility, setColumnVisibility] = createSignal<VisibilityState>(
    {}
  );

  // Grouping
  const [grouping, setGrouping] = createSignal<GroupingState>(
    props.groupBy?.map((g) => g.id.toString()) ?? []
  );

  // Row selection
  const [rowSelection, setRowSelection] = createSignal<Record<string, boolean>>(
    {}
  );

  // Global filter
  const [globalFilter, setGlobalFilter] = createSignal<TFilter[]>(
    props.filters ?? []
  );

  const columns = createMemo(() => {
    const columnsList: ColumnDef<TData>[] = [];

    if (!props.groupBy) return columnsList;

    for (const group of props.groupBy) {
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
      return props.data;
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
      get columnVisibility() {
        return columnVisibility();
      },
      get rowSelection() {
        return rowSelection();
      },
      get grouping() {
        return grouping();
      },
      get globalFilter() {
        return globalFilter();
      },
    },
    onSortingChange: setSortingState,
    onExpandedChange: setExpanded,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGroupingChange: setGrouping,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _, filterValue: TableFilter<TData>[]) => {
      return filterValue.every((f) => f.predicate(row.original, row));
    },
  });

  return (
    <TableContext.Provider value={{ table }}>
      <div ref={props.ref} class={cn('size-full flex flex-col', props.class)}>
        {props.children}
      </div>
    </TableContext.Provider>
  );
}
