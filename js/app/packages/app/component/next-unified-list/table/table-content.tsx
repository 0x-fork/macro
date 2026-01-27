import { useTable } from '@app/component/next-unified-list/table/table-context';
import type { TableData } from '@app/component/next-unified-list/table/types';
import type { Row } from '@tanstack/solid-table';
import { cn } from '@ui/utils/classname';
import { type Accessor, createMemo, createSignal, type JSX } from 'solid-js';
import { type VirtualizerHandle, VList } from 'virtua/solid';

const DEFAULT_ITEM_SIZE = 50;
const DEFAULT_OVERSCAN = 5;

interface TableContentProps<TData extends TableData> {
  virtualizerRef?: (handle: VirtualizerHandle) => void;
  class?: string;
  virtualizerClass?: string;
  itemSize?: number;
  overscan?: number;
  children: (row: Row<TData>, index: Accessor<number>) => JSX.Element;
  onScrollBottom?: VoidFunction;
  scrollBottomOffset?: number;
}

// TODO: Handle fallback states?
export function TableContent<TData extends TableData>(
  props: TableContentProps<TData>
) {
  const context = useTable<TData>();

  const [virtualizerHandle, setVirtualizerHandle] =
    createSignal<VirtualizerHandle>();

  const rows = createMemo(() => context.controller.table.getRowModel().rows);

  const itemSize = createMemo(() => props.itemSize ?? DEFAULT_ITEM_SIZE);
  const overscan = createMemo(() => props.overscan ?? DEFAULT_OVERSCAN);

  const handleScroll = (offset: number) => {
    const handle = virtualizerHandle();

    if (!handle) return;

    if (
      handle.scrollSize - handle.viewportSize - offset <=
      (props.scrollBottomOffset ?? 100)
    ) {
      props.onScrollBottom?.();
    }
  };

  const registerVirtualizerHandler = (
    handle: VirtualizerHandle | undefined
  ) => {
    setVirtualizerHandle(handle);

    if (handle) {
      props.virtualizerRef?.(handle);
    }
  };

  return (
    <div class={cn('unified-table-body size-full relative', props.class)}>
      <VList
        ref={registerVirtualizerHandler}
        class={props.virtualizerClass}
        data={rows()}
        itemSize={itemSize()}
        bufferSize={overscan() * itemSize()}
        onScroll={handleScroll}
      >
        {(row, i) => props.children(row, i)}
      </VList>
    </div>
  );
}
