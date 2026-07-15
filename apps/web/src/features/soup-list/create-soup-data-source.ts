import { deduplicateEntities } from '@app/features/next-soup/utils';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useDealStages } from '@companies/crm/deal-stages';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import {
  ENABLE_FEATURED_SEARCH_RESULTS,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_FLAG,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE,
} from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
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
import { useQueryClient } from '@queries/client';
import { invalidateUserNotifications } from '@queries/notification/user-notifications';
import { useTagsQuery } from '@queries/properties/tags';
import type {
  GroupMeta as ApiGroupMeta,
  GroupByField,
} from '@queries/soup/grouped/types';
import type { SoupParams } from '@queries/soup/items';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { soupKeys } from '@queries/soup/keys';
import {
  entityMatchesTagFilter,
  soupItemMatchesTagFilter,
} from '@queries/soup/tag-filter';
import { mapApiSoupItemToEntity } from '@queries/soup/transform-utils';
import type { SoupApiItem } from '@service-storage/generated/schemas';
import { type Accessor, createMemo } from 'solid-js';
import {
  buildDateSoupGroups,
  buildPropertySoupGroups,
  soupPropertyGroupKey,
} from './build-soup-groups';
import {
  buildFlatSoupItems,
  buildGroupedSoupItems,
  type SoupItemGroup,
} from './build-soup-items';
import { createGroupedSoupQueries } from './create-grouped-soup-queries';
import type { SoupCollectionControls } from './create-soup-collection-state';
import { createSearchState } from './create-soup-search-state';
import type { FacetCtx } from './facets';
import { createSoupEntityTransformer } from './transform-soup-entities';
import type { SoupItem } from './types';

type SoupEntity = EntityData & { notifications?: Accessor<Notification[]> };

type EntityWithRawNotifications = EntityData & {
  notifications?: Notification[];
};

export type CreateSoupDataSourceOptions = {
  controls: SoupCollectionControls;
  enabled?: Accessor<boolean>;
  additionalEntities?: Accessor<EntityData[]>;
  disableLocalSearch?: Accessor<boolean>;
  scopeNotifications?: (
    entity: EntityData,
    notifications: Notification[]
  ) => Notification[];
  isClientGroup?: (field: GroupByField) => boolean;
  sortConfigs: Record<
    string,
    { id: string; fn: (a: EntityData, b: EntityData) => number }
  >;
};

type ApiSortMethod = Exclude<
  NonNullable<SoupParams['sort_method']>,
  'frecency'
>;
type ApiSoupParams = Omit<SoupParams, 'sort_method'> & {
  sort_method: ApiSortMethod;
};

const API_SORTS = new Set<ApiSortMethod>([
  'viewed_at',
  'created_at',
  'updated_at',
  'viewed_updated',
]);

/**
 * Builds browse, search, grouped and disabled Soup sources and exposes one
 * ListDataSource. Soup-specific enrichment and row construction stay here;
 * the generic List package only receives identifiable SoupItem objects.
 */
export function createSoupDataSource(options: CreateSoupDataSourceOptions) {
  const { controls } = options;
  const queryClient = useQueryClient();
  const notificationSource = useGlobalNotificationSource();
  const userId = useUserId();
  const dealStages = useDealStages();
  const enabled = () => options.enabled?.() ?? true;

  const supportedForeignEntities = useFeatureFlag(
    ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_FLAG,
    { enabledOverride: ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE }
  );

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
    return;
  });

  const isClientDateGroup = () => controls.groupBy() === 'date';
  const isClientPropertyGroup = () => {
    const field = groupByField();
    return field !== undefined && (options.isClientGroup?.(field) ?? false);
  };
  const serverGroupByField = () =>
    isClientDateGroup() || isClientPropertyGroup() ? undefined : groupByField();

  const tagsQuery = useTagsQuery();
  const tagDefinitions = createMemo(() => {
    const definitions = new Map<string, string>();
    for (const set of tagsQuery.data ?? []) {
      for (const option of set.options) {
        definitions.set(option.id, option.propertyDefinitionId);
      }
    }
    return definitions;
  });
  const facetContext = (): FacetCtx => ({
    userId: userId(),
    notificationSource,
    assignees: controls.facets.getSelected('assignee'),
    tagDefs: tagDefinitions(),
    resolveCompanyStage: (entity) =>
      dealStages.resolveStage(
        entity as Parameters<typeof dealStages.resolveStage>[0]
      ),
  });

  const soupBody = createMemo(() => ({
    ...controls.facets.compile(facetContext()),
    ...(controls.emailView() ? { emailView: controls.emailView() } : {}),
  }));
  const soupParams = createMemo((): ApiSoupParams => {
    const requested = controls.sort()[0]?.id ?? 'updated_at';
    return {
      limit: 100,
      sort_method: API_SORTS.has(requested as ApiSortMethod)
        ? (requested as ApiSortMethod)
        : 'created_at',
    };
  });

  const search = createSearchState({
    facets: controls.facets,
    facetContext,
    disableLocalSearch: options.disableLocalSearch,
    searchPaused: () => controls.searchPaused() || !enabled(),
    searchText: controls.search,
    setSearchText: controls.setSearch,
  });

  const activeTagIds = () => controls.facets.getSelected('tag');

  const matchesActiveFilters = (item: SoupApiItem) =>
    soupItemMatchesTagFilter(item, activeTagIds()) &&
    controls.facets.test(mapApiSoupItemToEntity(item), facetContext());

  const itemsQuery = useSoupAstItemsQuery(
    () => ({
      params: soupParams(),
      body: soupBody(),
      groupBy: serverGroupByField(),
    }),
    () => ({
      enabled: enabled() && !search.isSearching(),
      showSupportedForeignEntities: supportedForeignEntities().enabled,
      meta: { itemFilter: matchesActiveFilters },
    })
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
          options.scopeNotifications?.(withoutRaw, raw) ?? raw,
      } as SoupEntity;
    }

    const notifications = useNotificationsForEntity(
      notificationSource,
      toNotificationEntity(entity)
    );
    return {
      ...entity,
      notifications: () => {
        const current = notifications();
        return options.scopeNotifications?.(entity, current) ?? current;
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
      include: (entity) =>
        controls.facets.test(entity, facetContext()) &&
        entityMatchesTagFilter(entity, activeTagIds()),
      deduplicate: (input) => deduplicateEntities(input) as SoupEntity[],
      compare: compareEntities,
    }
  );

  const browseEntities = (): EntityData[] => {
    const data = itemsQuery.data;
    if (!data || data.groups) return [];
    return [...(options.additionalEntities?.() ?? []), ...data.entities];
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
      showSupportedForeignEntities: supportedForeignEntities().enabled,
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

  const items = createMemo((): readonly SoupItem[] => {
    if (!enabled()) return [];

    if (search.isSearching()) {
      const entities = transformEntities(searchEntities(), {
        priorityIds: ENABLE_FEATURED_SEARCH_RESULTS
          ? search.featuredIds()
          : undefined,
      });
      return buildFlatSoupItems(entities);
    }

    const apiGroups = itemsQuery.data?.groups;
    if (serverGroupByField() && apiGroups && !itemsQuery.isPlaceholderData) {
      const groups = rawServerGroups(apiGroups).map((group) => ({
        ...group,
        entities: transformEntities(group.entities, { sort: true }),
      }));
      return buildGroupedSoupItems(groups, controls.disclosure.isExpanded);
    }

    const entities = transformEntities(browseEntities(), { sort: true });
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

  return {
    items,
    isLoading: () =>
      enabled() &&
      (search.isSearching() ? searchQuery.isLoading : itemsQuery.isLoading),
    isFetching: () =>
      enabled() &&
      (search.isSearching() ? searchQuery.isFetching : itemsQuery.isFetching),
    error: () => (search.isSearching() ? searchQuery.error : itemsQuery.error),
    hasMore: () =>
      enabled() &&
      (search.isSearching()
        ? searchQuery.isEnabled && !!searchQuery.hasNextPage
        : itemsQuery.isEnabled && !!itemsQuery.hasNextPage),
    isLoadingMore: () =>
      search.isSearching()
        ? searchQuery.isFetchingNextPage
        : itemsQuery.isFetchingNextPage,
    loadMore: async () => {
      if (!enabled()) return;
      if (search.isSearching()) {
        if (searchQuery.isEnabled && searchQuery.hasNextPage) {
          await searchQuery.fetchNextPage();
        }
        return;
      }
      if (itemsQuery.isEnabled && itemsQuery.hasNextPage) {
        await itemsQuery.fetchNextPage();
      }
    },
    refresh: async () => {
      if (!enabled()) return;
      await Promise.all([
        queryClient.invalidateQueries(
          { queryKey: soupKeys._def },
          { throwOnError: true }
        ),
        invalidateUserNotifications(),
      ]);
    },
    status: {
      isPlaceholderData: () =>
        !search.isSearching() && itemsQuery.isPlaceholderData,
      isSearching: search.isSearching,
      isSearchServiceLoading: search.isSearchServiceLoading,
      isLocalSearchSettling: search.isLocalSearchSettling,
      featuredIds: search.featuredIds,
      groupByField,
    },
  };
}
