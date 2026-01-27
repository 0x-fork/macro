import { TableContext } from '@app/component/next-unified-list/table/table-context';
import {
  createTableController,
  type TableControllerOptions,
  type TableController,
} from '@app/component/next-unified-list/table/table-controller';
import type {
  TableData,
  TableFilter,
} from '@app/component/next-unified-list/table/types';
import { cn } from '@ui/utils/classname';
import type { FlowProps } from 'solid-js';

type WithController<TData extends TableData> =
  | {
      data: TData[];
      controller?: undefined;
    }
  | {
      data?: undefined;
      controller: TableController<TData>;
    };

type TableRootProps<
  TData extends TableData,
  TFilter extends TableFilter<TData>,
> = {
  ref?: (el: HTMLElement) => void;
  class?: string;
  controller?: TableController<TData>;
} & TableControllerOptions<TData, TFilter> &
  WithController<TData>;

export function TableRoot<
  TData extends TableData,
  TFilter extends TableFilter<TData> = TableFilter<TData>,
>(props: FlowProps<TableRootProps<TData, TFilter>>) {
  const controller =
    props.controller ??
    createTableController({
      data: () => props.data,
      initialState: props.initialState,
      onNavigate: props.onNavigate,
    });

  return (
    <TableContext.Provider value={{ controller }}>
      <div ref={props.ref} class={cn('size-full flex flex-col', props.class)}>
        {props.children}
      </div>
    </TableContext.Provider>
  );
}
