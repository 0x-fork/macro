import type { Row } from '@tanstack/solid-table';

export type TableData = { id: string };

export type TableFilter<TData> = {
  id: string;
  predicate: (data: TData, row: Row<TData>) => boolean;
};

export type GroupByObj<TData> = {
  id: keyof TData | (string & {});
  getValue: (row: TData) => any;
};
