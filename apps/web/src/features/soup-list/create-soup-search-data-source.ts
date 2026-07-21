import type { ListDataSource } from '@app/components/list';
import { ENABLE_FEATURED_SEARCH_RESULTS } from '@core/constant/featureFlags';
import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';
import { createMemo } from 'solid-js';
import type { SoupCollectionControls } from './create-soup-collection-state';
import { createSearchState } from './create-soup-search-state';
import type { FacetCtx } from './facets';
import { createSoupEntityRow } from './soup-rows';
import type { TransformSoupEntitiesOptions } from './transform-soup-entities';
import type { SoupRow } from './types';

function buildSearchSoupRows<TEntity extends EntityData>(
  entities: readonly TEntity[],
  featuredIds: readonly string[]
): SoupRow[] {
  if (featuredIds.length === 0) {
    return entities.map((entity) => createSoupEntityRow(entity));
  }

  const featured = new Set(featuredIds);
  const featuredEntities = entities.filter((entity) => featured.has(entity.id));
  if (featuredEntities.length === 0) {
    return entities.map((entity) => createSoupEntityRow(entity));
  }

  const remaining = entities.filter((entity) => !featured.has(entity.id));
  const rows: SoupRow[] = [
    {
      kind: 'section-header',
      id: 'section:featured-results',
      label: 'Featured Results',
    },
    ...featuredEntities.map((entity) => createSoupEntityRow(entity)),
  ];
  if (remaining.length > 0) {
    rows.push(
      {
        kind: 'section-header',
        id: 'section:more-results',
        label: 'More Results',
      },
      ...remaining.map((entity) => createSoupEntityRow(entity))
    );
  }
  return rows;
}

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
    searchPaused: () =>
      options.controls.state.searchPaused || !options.enabled(),
    searchText: () => options.controls.state.search,
    setSearchText: (value) => {
      const next =
        typeof value === 'function'
          ? value(options.controls.state.search)
          : value;
      options.controls.setState('search', next);
      return next;
    },
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

    return buildSearchSoupRows(transformedEntities(), search.featuredIds());
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
  } satisfies ListDataSource<SoupRow>;

  return {
    ...dataSource,
    active: search.isSearching,
  };
}
