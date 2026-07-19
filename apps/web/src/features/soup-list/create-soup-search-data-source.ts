import type { ListDataSource } from '@app/components/list';
import { ENABLE_FEATURED_SEARCH_RESULTS } from '@core/constant/featureFlags';
import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';
import { createMemo } from 'solid-js';
import { buildSearchSoupItems } from './build-soup-items';
import type { SoupCollectionControls } from './create-soup-collection-state';
import { createSearchState } from './create-soup-search-state';
import type { FacetCtx } from './facets';
import type { TransformSoupEntitiesOptions } from './transform-soup-entities';
import type { SoupItem } from './types';

export type CreateSoupSearchDataSourceOptions<
  TEntity extends EntityData = EntityData,
> = {
  controls: SoupCollectionControls;
  enabled: Accessor<boolean>;
  facetContext: Accessor<FacetCtx>;
  disableLocalSearch?: Accessor<boolean>;
  transformEntities: (
    entities: readonly EntityData[],
    options?: TransformSoupEntitiesOptions
  ) => TEntity[];
};

/** Search-only query, result transformation, pagination, and row construction. */
export function createSoupSearchDataSource<TEntity extends EntityData>(
  options: CreateSoupSearchDataSourceOptions<TEntity>
) {
  const search = createSearchState({
    facets: options.controls.facets,
    facetContext: options.facetContext,
    disableLocalSearch: options.disableLocalSearch,
    searchPaused: () => options.controls.searchPaused() || !options.enabled(),
    searchText: options.controls.search,
    setSearchText: options.controls.setSearch,
  });

  const entities = createMemo<EntityData[]>((previous) => {
    const merged = [
      ...search.serviceSearchResults(),
      ...search.localFuzzyResults(),
    ];
    return merged.length === 0 &&
      previous.length > 0 &&
      search.isLocalSearchSettling()
      ? previous
      : merged;
  }, []);

  const transformedEntities = createMemo(() =>
    options.transformEntities(entities(), {
      priorityIds: ENABLE_FEATURED_SEARCH_RESULTS
        ? search.featuredIds()
        : undefined,
    })
  );

  const items = createMemo(() => {
    if (!options.enabled()) {
      return [];
    }

    return buildSearchSoupItems(transformedEntities(), search.featuredIds());
  });

  const { searchQuery } = search;

  const dataSource = {
    items,
    isLoading: () =>
      options.enabled() &&
      searchQuery.isFetching &&
      !searchQuery.isFetchingNextPage,
    isFetching: () =>
      options.enabled() &&
      (searchQuery.isFetching ||
        search.isSearchServiceLoading() ||
        search.isLocalSearchSettling()),
    error: () => (options.enabled() ? searchQuery.error : undefined),
    hasMore: () =>
      options.enabled() && searchQuery.isEnabled && !!searchQuery.hasNextPage,
    isLoadingMore: () => options.enabled() && searchQuery.isFetchingNextPage,
    loadMore: async () => {
      if (!options.enabled()) return;
      if (!searchQuery.isEnabled || !searchQuery.hasNextPage) return;

      await searchQuery.fetchNextPage();
    },
    refresh: async () => {
      if (!options.enabled() || !searchQuery.isEnabled) return;

      await searchQuery.refetch();
    },
  } satisfies ListDataSource<SoupItem>;

  return {
    ...dataSource,
    active: search.isSearching,
  };
}
