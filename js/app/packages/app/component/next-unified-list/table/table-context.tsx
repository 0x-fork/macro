import type { Table } from '@tanstack/solid-table';
import { createContext, useContext } from 'solid-js';

interface TableContextValues<TData> {
  table: Table<TData>;
}

export const TableContext = createContext<TableContextValues<any>>();

export function useTable<TData>() {
  const context = useContext(TableContext);

  if (!context) {
    throw new Error('useTable must be used within TableContextProvider');
  }

  return context as TableContextValues<TData>;
}
