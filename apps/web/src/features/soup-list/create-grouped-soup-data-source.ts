import type { ListDataSource } from '@app/components/list';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  ENABLE_GRAPHQL_SOUP_FLAG,
  ENABLE_GRAPHQL_SOUP_OVERRIDE,
} from '@core/constant/featureFlags';
import { idToDisplayName } from '@core/user/util';
import {
  COMPANY_STAGE_OPTIONS,
  type EntityData,
  getPropertyOptionLabel,
} from '@entity';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import type { GroupMeta as ApiGroupMeta } from '@queries/soup/grouped/types';
import type { Accessor } from 'solid-js';
import { createMemo } from 'solid-js';
import { createGroupedSoupQueries } from './create-grouped-soup-queries';
import type { SoupCollectionControls } from './create-soup-collection-state';
import {
  buildDateSoupRows,
  buildPropertySoupRows,
  buildServerSoupRows,
  createSoupGrouping,
  type ServerSoupGroup,
  soupPropertyGroupKey,
} from './soup-grouping';
import type { TransformSoupEntitiesOptions } from './transform-soup-entities';
import type { SoupRow } from './types';
import { useReactiveSoupDataSource } from './use-reactive-soup-data-source';
import { useRestSoupDataSource } from './use-rest-soup-data-source';
import { useSoupBrowseRequest } from './use-soup-browse-request';

export type CreateGroupedSoupDataSourceOptions<
  TEntity extends EntityData = EntityData,
> = {
  controls: SoupCollectionControls;
  enabled: Accessor<boolean>;
  additionalEntities?: Accessor<EntityData[]>;
  limit?: Accessor<number>;
  transformEntities: (
    entities: readonly EntityData[],
    options?: TransformSoupEntitiesOptions
  ) => TEntity[];
};

/** Client and server grouping with independently owned query transports. */
export function createGroupedSoupDataSource<TEntity extends EntityData>(
  options: CreateGroupedSoupDataSourceOptions<TEntity>
) {
  const { controls } = options;
  const grouping = createSoupGrouping(controls);
  const {
    dealStages,
    soupBody,
    soupParams,
    matchesActiveFilters,
    showSupportedForeignEntities,
  } = useSoupBrowseRequest({
    controls,
    enabled: options.enabled,
    limit: options.limit,
  });
  const graphqlSoup = useFeatureFlag(ENABLE_GRAPHQL_SOUP_FLAG, {
    enabledOverride: ENABLE_GRAPHQL_SOUP_OVERRIDE,
  });

  const clientGrouping = () =>
    grouping.active() && grouping.serverGroupByField() === undefined;
  const groupedTransport = (): 'graphql' | undefined =>
    grouping.serverGroupByField() && graphqlSoup().enabled
      ? 'graphql'
      : undefined;

  const reactive = useReactiveSoupDataSource({
    enabled: () =>
      options.enabled() && clientGrouping() && graphqlSoup().enabled,
    params: soupParams,
    body: soupBody,
    showSupportedForeignEntities,
  });
  const useReactiveSource = () =>
    clientGrouping() && graphqlSoup().enabled && reactive.isSupported();

  const rest = useRestSoupDataSource({
    enabled: () =>
      options.enabled() && grouping.active() && !useReactiveSource(),
    params: soupParams,
    body: soupBody,
    groupBy: grouping.serverGroupByField,
    transport: groupedTransport,
    showSupportedForeignEntities,
    itemFilter: matchesActiveFilters,
  });
  const activeBrowseSource = createMemo<ListDataSource<EntityData>>(() =>
    useReactiveSource() ? reactive : rest
  );

  const itemsQuery = rest.query;

  const groupedEntities = createMemo(() => {
    if (grouping.serverGroupByField()) {
      return [];
    }

    return options.transformEntities(
      [
        ...(options.additionalEntities?.() ?? []),
        ...activeBrowseSource().items(),
      ],
      { sort: true }
    );
  });

  const groupQueries = createGroupedSoupQueries({
    initialPage: createMemo(() => {
      if (itemsQuery.isPlaceholderData) {
        return undefined;
      }

      const groups = itemsQuery.data?.groups;
      const items = itemsQuery.data?.itemsById;

      if (!groups || !items) {
        return undefined;
      }

      return { groups, items };
    }),
    groupByField: grouping.serverGroupByField,
    soupParams,
    soupBody,
    transport: groupedTransport,
    queryOptions: () => ({
      enabled: options.enabled() && grouping.active(),
      filterSelectedItems: false,
      showSupportedForeignEntities: showSupportedForeignEntities(),
      meta: { itemFilter: matchesActiveFilters },
    }),
  });

  const resolveGroupLabel = (groupId: string, fallback: string) => {
    const field = controls.groupByField();
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
  ): ServerSoupGroup<EntityData>[] =>
    groups.map((group) => {
      const query = groupQueries.map().get(group.key);

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

  const buildClientPropertyRows = (entities: readonly TEntity[]) => {
    const field = controls.groupByField();
    if (field?.type !== 'property') return [];

    const definitionId = field.propertyDefinitionId;
    const stage = definitionId === SYSTEM_PROPERTY_IDS.STAGE;
    let preferredOrder = COMPANY_STAGE_OPTIONS.map(
      (item) => item.value as string
    );
    if (stage) preferredOrder = dealStages.stages().map((item) => item.id);

    return buildPropertySoupRows(entities, {
      groupIdFor: (entity) => {
        if (!stage) return soupPropertyGroupKey(entity, definitionId);
        return (
          dealStages.resolveStage(
            entity as Parameters<typeof dealStages.resolveStage>[0]
          ) ?? ''
        );
      },
      preferredOrder,
      labelFor: (id) => resolveGroupLabel(id, id),
    });
  };

  const items = createMemo(() => {
    if (!options.enabled() || !grouping.active()) {
      return [];
    }

    const apiGroups = itemsQuery.data?.groups;
    if (
      grouping.serverGroupByField() &&
      apiGroups &&
      !itemsQuery.isPlaceholderData
    ) {
      const groups = rawServerGroups(apiGroups).map((group) => ({
        ...group,
        entities: options.transformEntities(group.entities, { sort: true }),
      }));

      return buildServerSoupRows(groups);
    }

    const entities = groupedEntities();

    if (grouping.isClientDateGroup()) {
      return buildDateSoupRows(entities);
    }

    if (grouping.isClientPropertyGroup()) {
      return buildClientPropertyRows(entities);
    }

    return [];
  });

  const dataSource = {
    items,
    isLoading: () => options.enabled() && activeBrowseSource().isLoading(),
    isFetching: () => options.enabled() && activeBrowseSource().isFetching(),
    error: () => (options.enabled() ? activeBrowseSource().error() : undefined),
    hasMore: () => options.enabled() && activeBrowseSource().hasMore(),
    isLoadingMore: () =>
      options.enabled() && activeBrowseSource().isLoadingMore(),
    loadMore: async () => {
      if (!options.enabled()) return;

      const source = activeBrowseSource();
      if (!source.hasMore()) return;

      await source.loadMore();
    },
    refresh: async () => {
      if (!options.enabled()) return;

      await activeBrowseSource().refresh();
    },
  } satisfies ListDataSource<SoupRow>;

  return {
    ...dataSource,
    active: grouping.active,
  };
}
