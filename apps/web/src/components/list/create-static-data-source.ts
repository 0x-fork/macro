import type { Accessor } from 'solid-js';
import type { Identifiable } from './selection-state';
import type { ListDataSource } from './types';

export function createStaticListDataSource<
  TItem extends Identifiable = Identifiable,
>(items: Accessor<readonly TItem[]>): ListDataSource<TItem> {
  return {
    items,
    isLoading: () => false,
    isFetching: () => false,
    error: () => undefined,
    hasMore: () => false,
    isLoadingMore: () => false,
    loadMore: async () => {},
    refresh: async () => {},
  };
}
