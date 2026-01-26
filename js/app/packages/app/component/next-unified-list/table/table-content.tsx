import { useTable } from '@app/component/next-unified-list/table/table-context';
import type { Row } from '@tanstack/solid-table';
import { cn } from '@ui/utils/classname';
import { type Accessor, createMemo, type JSX } from 'solid-js';
import { VList } from 'virtua/solid';

const DEFAULT_ITEM_SIZE = 50;
const DEFAULT_OVERSCAN = 5;

interface TableContentProps<TData> {
  class?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: Row<TData>, index: Accessor<number>) => JSX.Element;
}

// TODO: Handle fallback states?
export function TableContent<TData>(props: TableContentProps<TData>) {
  const context = useTable<TData>();
  const rows = createMemo(() => context.table.getRowModel().rows);

  const itemSize = createMemo(() => props.itemSize ?? DEFAULT_ITEM_SIZE);
  const overscan = createMemo(() => props.overscan ?? DEFAULT_OVERSCAN);

  return (
    <div
      class={cn(
        'unified-table-body flex-1 overflow-auto relative',
        props.class
      )}
    >
      <VList
        data={rows()}
        itemSize={itemSize()}
        bufferSize={overscan() * itemSize()}
      >
        {(row, i) => props.children(row, i)}
      </VList>
    </div>
  );
}
