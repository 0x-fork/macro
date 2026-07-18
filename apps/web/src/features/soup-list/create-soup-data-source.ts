import type { ListDataSource } from '@app/components/list';
import {
  deduplicateEntities,
  scopeChannelNotificationsForEntity,
} from '@app/features/next-soup/utils';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  ENABLE_FEATURED_SEARCH_RESULTS,
  ENABLE_GRAPHQL_SOUP_FLAG,
  ENABLE_GRAPHQL_SOUP_OVERRIDE,
} from '@core/constant/featureFlags';
import { idToDisplayName } from '@core/user/util';
import {
  COMPANY_STAGE_OPTIONS,
  type EntityData,
  getPropertyOptionLabel,
  isWithNotification,
  type Notification,
  toNotificationEntity,
} from '@entity';
import { useNotificationsForEntity } from '@notifications';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { invalidateUserNotifications } from '@queries/notification/user-notifications';
import type {
  GroupMeta as ApiGroupMeta,
  GroupByField,
} from '@queries/soup/grouped/types';
import { type Accessor, createMemo } from 'solid-js';
import {
  buildDateSoupGroups,
  buildPropertySoupGroups,
  soupPropertyGroupKey,
} from './build-soup-groups';
import {
  buildFlatSoupItems,
  buildGroupedSoupItems,
  buildSearchSoupItems,
  type SoupItemGroup,
} from './build-soup-items';
import { createGroupedSoupQueries } from './create-grouped-soup-queries';
import type { SoupCollectionControls } from './create-soup-collection-state';
import { createSearchState } from './create-soup-search-state';
import { createSoupEntityTransformer } from './transform-soup-entities';
import type { SoupItem } from './types';
import { useReactiveSoupDataSource } from './use-reactive-soup-data-source';
import { useRestSoupDataSource } from './use-rest-soup-data-source';
import { useSoupBrowseRequest } from './use-soup-browse-request';

type SoupEntity = EntityData & { notifications?: Accessor<Notification[]> };

type EntityWithRawNotifications = EntityData & {
  notifications?: Notification[];
};

export type CreateSoupDataSourceOptions = {
  controls: SoupCollectionControls;
  enabled?: Accessor<boolean>;
  additionalEntities?: Accessor<EntityData[]>;
  disableLocalSearch?: Accessor<boolean>;
  sortConfigs: Record<
    string,
    { id: string; fn: (a: EntityData, b: EntityData) => number }
  >;
};

/**
 * Builds browse, search, grouped and disabled Soup sources and exposes one
 * ListDataSource. Soup-specific enrichment and row construction stay here;
 * the generic List package only receives identifiable SoupItem objects.
 */
export function createSoupDataSource(options: CreateSoupDataSourceOptions) {
  const { controls } = options;
  const request = useSoupBrowseRequest(options);
  const {
    enabled,
    notificationSource,
    dealStages,
    facetContext,
    soupBody,
    soupParams,
    matchesActiveFilters,
    matchesEntityFilters,
    showSupportedForeignEntities,
  } = request;

  const graphqlSoup = useFeatureFlag(ENABLE_GRAPHQL_SOUP_FLAG, {
    enabledOverride: ENABLE_GRAPHQL_SOUP_OVERRIDE,
  });

  const groupByField = createMemo((): GroupByField | undefined => {
    const id = controls.groupBy();
    if (!id || id === 'date') return;
    if (id === 'entity_type') return { type: 'entity_type' };
    if (id === 'project') return { type: 'project' };
    if (id.startsWith('property:')) {
      return {
        type: 'property',
        propertyDefinitionId: id.slice('property:'.length),
      };
    }
  });

  const isClientDateGroup = () => controls.groupBy() === 'date';
  const isClientPropertyGroup = () => {
    const field = groupByField();
    const scopes = controls.facets.getSelected('scope');
    return (
      field?.type === 'property' &&
      (scopes.includes('crm-company-active') ||
        scopes.includes('crm-company-hidden'))
    );
  };
  const serverGroupByField = () =>
    isClientDateGroup() || isClientPropertyGroup() ? undefined : groupByField();

  const search = createSearchState({
    facets: controls.facets,
    facetContext,
    disableLocalSearch: options.disableLocalSearch,
    searchPaused: () => controls.searchPaused() || !enabled(),
    searchText: controls.search,
    setSearchText: controls.setSearch,
  });

  const reactiveEligible = () => serverGroupByField() === undefined;
  const reactive = useReactiveSoupDataSource({
    enabled: () => enabled() && graphqlSoup().enabled && reactiveEligible(),
    params: soupParams,
    body: soupBody,
    showSupportedForeignEntities,
  });
  const useReactiveSource = () =>
    graphqlSoup().enabled && reactiveEligible() && reactive.isSupported();

  const rest = useRestSoupDataSource({
    enabled: () => enabled() && !search.isSearching() && !useReactiveSource(),
    params: soupParams,
    body: soupBody,
    groupBy: serverGroupByField,
    showSupportedForeignEntities,
    itemFilter: matchesActiveFilters,
  });
  const itemsQuery = rest.query;

  const activeBrowseSource = createMemo(() =>
    useReactiveSource() ? reactive : rest
  );

  const rawNotifications = (entity: EntityData) => {
    const value = (entity as EntityWithRawNotifications).notifications;
    return Array.isArray(value) ? value : undefined;
  };

  const attachNotifications = (entity: EntityData): SoupEntity => {
    if (isWithNotification(entity)) return entity;
    const raw = rawNotifications(entity);
    if (raw) {
      const { notifications: _notifications, ...withoutRaw } =
        entity as EntityWithRawNotifications;
      return {
        ...withoutRaw,
        notifications: () =>
          scopeChannelNotificationsForEntity(withoutRaw, raw),
      } as SoupEntity;
    }

    const notifications = useNotificationsForEntity(
      notificationSource,
      toNotificationEntity(entity)
    );
    return {
      ...entity,
      notifications: () => {
        return scopeChannelNotificationsForEntity(entity, notifications());
      },
    } as SoupEntity;
  };

  const compareEntities = (left: SoupEntity, right: SoupEntity) => {
    for (const sort of controls.sort()) {
      const result = options.sortConfigs[sort.id]?.fn(left, right) ?? 0;
      if (result !== 0) return sort.reversed ? -result : result;
    }
    return 0;
  };

  const transformEntities = createSoupEntityTransformer<EntityData, SoupEntity>(
    {
      enrich: attachNotifications,
      include: matchesEntityFilters,
      deduplicate: (input) => deduplicateEntities(input) as SoupEntity[],
      compare: compareEntities,
    }
  );

  const browseEntities = (): EntityData[] => {
    if (serverGroupByField()) return [];
    return [
      ...(options.additionalEntities?.() ?? []),
      ...activeBrowseSource().items(),
    ];
  };

  const searchEntities = createMemo<EntityData[]>((previous) => {
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

  const groupQueries = createGroupedSoupQueries({
    initialPage: createMemo(() => {
      if (itemsQuery.isPlaceholderData) return;
      const groups = itemsQuery.data?.groups;
      const items = itemsQuery.data?.itemsById;
      if (!groups || !items) return;
      return { groups, items };
    }),
    groupByField: serverGroupByField,
    soupParams,
    soupBody,
    queryOptions: () => ({
      enabled: enabled() && !search.isSearching(),
      filterSelectedItems: false,
      showSupportedForeignEntities: showSupportedForeignEntities(),
      // Keep the raw API filter in query metadata for cache insertion guards.
      // Rendered group entities are filtered by the items memo below.
      meta: { itemFilter: matchesActiveFilters },
    }),
  });

  const groupQueryFor = (groupId: string) => groupQueries.map().get(groupId);

  const resolveGroupLabel = (groupId: string, fallback: string) => {
    const field = groupByField();
    if (
      field?.type === 'property' &&
      field.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STAGE
    ) {
      return (
        dealStages.stageLabel(groupId) ??
        getPropertyOptionLabel(groupId) ??
        fallback
      );
    }
    if (
      field?.type === 'property' &&
      field.propertyDefinitionId === SYSTEM_PROPERTY_IDS.COMPANY_OWNER
    ) {
      return idToDisplayName(groupId) || fallback;
    }
    return getPropertyOptionLabel(groupId) ?? fallback;
  };

  const rawServerGroups = (
    groups: readonly ApiGroupMeta[]
  ): SoupItemGroup<EntityData>[] =>
    groups.map((group) => {
      const query = groupQueryFor(group.key);
      return {
        id: group.key,
        label: resolveGroupLabel(group.key, group.label),
        entities: query?.data()?.entities ?? [],
        count: group.totalCount,
        loadMore: query?.hasNextPage()
          ? () => query.fetchNextPage()
          : undefined,
        isLoading: query ? query.isFetchingNextPage : undefined,
      };
    });

  const browseFlatEntities = createMemo(() =>
    transformEntities(browseEntities(), { sort: true })
  );

  const searchFlatEntities = createMemo(() =>
    transformEntities(searchEntities(), {
      priorityIds: ENABLE_FEATURED_SEARCH_RESULTS
        ? search.featuredIds()
        : undefined,
    })
  );

  const buildClientPropertyItems = (entities: readonly SoupEntity[]) => {
    const field = groupByField();
    const definitionId =
      field?.type === 'property' ? field.propertyDefinitionId : '';
    const stage = definitionId === SYSTEM_PROPERTY_IDS.STAGE;
    const groups = buildPropertySoupGroups(entities, {
      groupIdFor: (entity) =>
        stage
          ? (dealStages.resolveStage(
              entity as Parameters<typeof dealStages.resolveStage>[0]
            ) ?? '')
          : soupPropertyGroupKey(entity, definitionId),
      preferredOrder: stage
        ? dealStages.stages().map((item) => item.id)
        : COMPANY_STAGE_OPTIONS.map((item) => item.value as string),
      labelFor: (id) => resolveGroupLabel(id, id),
    });
    return buildGroupedSoupItems(groups, controls.disclosure.isExpanded);
  };

  const items = createMemo(() => {
    if (!enabled()) return [];

    if (search.isSearching()) {
      return buildSearchSoupItems(searchFlatEntities(), search.featuredIds());
    }

    const apiGroups = itemsQuery.data?.groups;
    if (serverGroupByField() && apiGroups && !itemsQuery.isPlaceholderData) {
      const groups = rawServerGroups(apiGroups).map((group) => ({
        ...group,
        entities: transformEntities(group.entities, { sort: true }),
      }));
      return buildGroupedSoupItems(groups, controls.disclosure.isExpanded);
    }

    const entities = browseFlatEntities();

    if (isClientDateGroup()) {
      return buildGroupedSoupItems(
        buildDateSoupGroups(entities),
        controls.disclosure.isExpanded
      );
    }

    if (isClientPropertyGroup()) {
      return buildClientPropertyItems(entities);
    }
    return buildFlatSoupItems(entities);
  });

  const { searchQuery } = search;

  const dataSource = {
    items,
    isLoading: () => {
      if (!enabled()) return false;
      if (search.isSearching()) return searchQuery.isLoading;

      return activeBrowseSource().isLoading();
    },
    isFetching: () => {
      if (!enabled()) return false;
      if (search.isSearching()) return searchQuery.isFetching;

      return activeBrowseSource().isFetching();
    },
    error: () =>
      search.isSearching() ? searchQuery.error : activeBrowseSource().error(),
    hasMore: () => {
      if (!enabled()) return false;

      if (search.isSearching())
        return searchQuery.isEnabled && !!searchQuery.hasNextPage;

      return activeBrowseSource().hasMore();
    },
    isLoadingMore: () => {
      if (search.isSearching()) {
        return searchQuery.isFetchingNextPage;
      }

      return activeBrowseSource().isLoadingMore();
    },
    loadMore: async () => {
      if (!enabled()) return;
      if (search.isSearching()) {
        if (searchQuery.isEnabled && searchQuery.hasNextPage) {
          await searchQuery.fetchNextPage();
        }
        return;
      }
      const source = activeBrowseSource();
      if (source.hasMore()) await source.loadMore();
    },
    refresh: async () => {
      if (!enabled()) return;
      const refreshData = search.isSearching()
        ? searchQuery.isEnabled
          ? searchQuery.refetch()
          : Promise.resolve()
        : activeBrowseSource().refresh();
      await Promise.all([refreshData, invalidateUserNotifications()]);
    },
  } satisfies ListDataSource<SoupItem>;

  return {
    ...dataSource,
    status: {
      isPlaceholderData: () =>
        !search.isSearching() &&
        !useReactiveSource() &&
        itemsQuery.isPlaceholderData,
      isSearching: search.isSearching,
      isSearchServiceLoading: search.isSearchServiceLoading,
      isLocalSearchSettling: search.isLocalSearchSettling,
      featuredIds: search.featuredIds,
      flatEntities: browseFlatEntities,
      groupByField,
    },
  };
}
