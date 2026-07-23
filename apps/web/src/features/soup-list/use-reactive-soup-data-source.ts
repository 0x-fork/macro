import type { ListDataSource } from '@app/components/list';
import type { EntityData } from '@entity';
import type { SoupAstBody } from '@queries/soup/items';
import { useReactiveSoupAstItemsQuery } from '@queries/soup/reactive-items';
import type { Accessor } from 'solid-js';
import type { ApiSoupParams } from './use-soup-browse-request';

const REACTIVE_SETTLED_NO_DATA_ERROR = new Error(
  'Reactive Soup request settled without data'
);
const DISABLED_REQUEST = {
  params: { limit: 0, sort_method: 'created_at' } satisfies ApiSoupParams,
  body: {} satisfies SoupAstBody,
};

/** Exposes the reactive GraphQL query as an entity list data source. */
export function useReactiveSoupDataSource(options: {
  enabled: Accessor<boolean>;
  params: Accessor<ApiSoupParams>;
  body: Accessor<SoupAstBody>;
  showSupportedForeignEntities: Accessor<boolean>;
}) {
  const query = useReactiveSoupAstItemsQuery(
    () => {
      if (!options.enabled()) return DISABLED_REQUEST;
      return { params: options.params(), body: options.body() };
    },
    () => ({
      enabled: options.enabled(),
      showSupportedForeignEntities: options.showSupportedForeignEntities(),
    })
  );

  const dataSource = {
    items: () => query.data()?.entities ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: () =>
      query.data() === undefined &&
      !query.isLoading() &&
      !query.isFetching() &&
      options.enabled()
        ? REACTIVE_SETTLED_NO_DATA_ERROR
        : undefined,
    hasMore: () => options.enabled() && query.hasNextPage(),
    isLoadingMore: query.isFetchingNextPage,
    loadMore: async () => {
      await query.fetchNextPage();
    },
    refresh: query.refresh,
  } satisfies ListDataSource<EntityData>;

  return { ...dataSource, isSupported: query.isSupported };
}
