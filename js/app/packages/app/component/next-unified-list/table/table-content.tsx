import { useTable } from '@app/component/next-unified-list/table/table-context';
import type { Row } from '@tanstack/solid-table';
import { cn } from '@ui/utils/classname';
import { type Accessor, createMemo, type JSX } from 'solid-js';
import { VList } from 'virtua/solid';

interface TableContentProps<TData> {
  class?: string;
  itemSize?: number;
  children: (row: Row<TData>, index: Accessor<number>) => JSX.Element;
}

// TODO: Handle fallback states?
export function TableContent<TData>(props: TableContentProps<TData>) {
  const context = useTable<TData>();
  const rows = createMemo(() => context.table.getRowModel().rows);
  return (
    <div
      class={cn(
        'unified-table-body flex-1 overflow-auto relative',
        props.class
      )}
    >
      <VList data={rows()} itemSize={50} bufferSize={10 * 50}>
        {(row, i) => props.children(row, i)}
      </VList>
    </div>
  );
}
