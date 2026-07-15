import type { Accessor } from 'solid-js';
import type { Identifiable } from './selection-state';

/** A reactive list data source. Items may have any shape with a stable id. */
export type ListDataSource<TItem extends Identifiable = Identifiable> = {
  items: Accessor<readonly TItem[]>;
  isLoading: Accessor<boolean>;
  isFetching: Accessor<boolean>;
  error: Accessor<unknown | undefined>;
  hasMore: Accessor<boolean>;
  isLoadingMore: Accessor<boolean>;
  loadMore: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
};

export type ListDataSourceItem<TSource> =
  TSource extends ListDataSource<infer TItem> ? TItem : never;
