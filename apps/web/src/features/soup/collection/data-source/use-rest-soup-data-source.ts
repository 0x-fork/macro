import type { ListDataSource } from '@app/components/list';
import type { EntityData } from '@entity';
import { useQueryClient } from '@queries/client';
import type { GroupByField } from '@queries/soup/grouped/types';
import type { SoupAstBody } from '@queries/soup/items';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { soupKeys } from '@queries/soup/keys';
import type { SoupApiItem } from '@service-storage/generated/schemas';
import type { Accessor } from 'solid-js';
import type { ApiSoupParams } from './use-soup-browse-request';

const DISABLED_REQUEST = {
  params: { limit: 0, sort_method: 'created_at' } satisfies ApiSoupParams,
  body: {} satisfies SoupAstBody,
  groupBy: undefined,
  transport: undefined,
};

/** Exposes the paginated REST query as an entity list data source. */
export function useRestSoupDataSource(options: {
  enabled: Accessor<boolean>;
  params: Accessor<ApiSoupParams>;
  body: Accessor<SoupAstBody>;
  groupBy: Accessor<GroupByField | undefined>;
  transport?: Accessor<'rest' | 'graphql' | undefined>;
  showSupportedForeignEntities: Accessor<boolean>;
  itemFilter: (item: SoupApiItem) => boolean;
}) {
  const queryClient = useQueryClient();
  const query = useSoupAstItemsQuery(
    () => {
      if (!options.enabled()) return DISABLED_REQUEST;
      return {
        params: options.params(),
        body: options.body(),
        groupBy: options.groupBy(),
        transport: options.transport?.(),
      };
    },
    () => ({
      enabled: options.enabled(),
      showSupportedForeignEntities: options.showSupportedForeignEntities(),
      meta: { itemFilter: options.itemFilter },
    })
  );

  const dataSource = {
    items: () => query.data?.entities ?? [],
    isLoading: () => query.isLoading,
    isFetching: () => query.isFetching,
    error: () => query.error,
    hasMore: () => query.isEnabled && !!query.hasNextPage,
    isLoadingMore: () => query.isFetchingNextPage,
    loadMore: async () => {
      await query.fetchNextPage();
    },
    refresh: () =>
      queryClient.invalidateQueries(
        { queryKey: soupKeys._def },
        { throwOnError: true }
      ),
  } satisfies ListDataSource<EntityData>;

  return { ...dataSource, query };
}
