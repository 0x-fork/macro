import type { Row } from '@tanstack/solid-table';
import { cn } from '@ui/utils/classname';
import type { FlowProps } from 'solid-js';

interface TableRowProps<TData> {
  class?: string;
  row: Row<TData>;
  index?: number;
}

export function TableRow<TData>(props: FlowProps<TableRowProps<TData>>) {
  return (
    <div
      class={cn('unified-table-row', props.class)}
      data-row-id={props.row.id}
      data-row
      role="row"
      tabIndex={0}
    >
      {props.children}
    </div>
  );
}
