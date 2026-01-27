import type { TableController } from '@app/component/next-unified-list/table/table-controller';
import type { TableData } from '@app/component/next-unified-list/table/types';
import { createContext, useContext } from 'solid-js';

interface TableContextValues<TData extends TableData> {
  controller: TableController<TData>;
}

export const TableContext = createContext<TableContextValues<any>>();

export function useTable<TData extends TableData>() {
  const context = useContext(TableContext);

  if (!context) {
    throw new Error('useTable must be used within TableContextProvider');
  }

  return context as TableContextValues<TData>;
}
