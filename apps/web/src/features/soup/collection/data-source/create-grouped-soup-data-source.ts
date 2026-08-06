import type { ListDataSource } from '@app/components/list';
import { idToDisplayName } from '@core/user/util';
import { type EntityData, getPropertyOptionLabel } from '@entity';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import type { GroupMeta as ApiGroupMeta } from '@queries/soup/grouped/types';
import type { Accessor } from 'solid-js';
import { createMemo } from 'solid-js';
import type { SoupCollectionControls } from '../create-soup-collection-state';
import {
  buildClientPropertySoupRows,
  buildDateSoupRows,
  buildServerSoupRows,
  type ServerSoupGroup,
} from '../soup-grouping';
import type { TransformSoupEntitiesOptions } from '../transform-soup-entities';
import type { SoupRow } from '../types';
import { createGroupedSoupQueries } from './create-grouped-soup-queries';
import { useRestSoupDataSource } from './use-rest-soup-data-source';
import type { useSoupBrowseRequest } from './use-soup-browse-request';

export type CreateGroupedSoupDataSourceOptions<
  TEntity extends EntityData = EntityData,
> = {
  controls: SoupCollectionControls;
  enabled: Accessor<boolean>;
  additionalEntities?: Accessor<EntityData[]>;
  request: Pick<
    ReturnType<typeof useSoupBrowseRequest>,
    | 'dealStages'
    | 'soupBody'
    | 'soupParams'
    | 'matchesActiveFilters'
    | 'showSupportedForeignEntities'
  >;
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

  const groupingActive = createMemo(
    () => controls.groupByField() !== undefined
  );

  const isClientDateGroup = createMemo(
    () => controls.groupByField()?.type === 'date'
  );

  const isClientPropertyGroup = createMemo(() => {
    if (controls.groupByField()?.type !== 'property') return false;

    const scopes = controls.facets.getSelected('scope');
    return (
      scopes.includes('crm-company-active') ||
      scopes.includes('crm-company-hidden')
    );
  });

  const serverGroupByField = createMemo(() => {
    if (isClientDateGroup() || isClientPropertyGroup()) return;
    return controls.groupByField();
  });

  const {
    dealStages,
    soupBody,
    soupParams,
    matchesActiveFilters,
    showSupportedForeignEntities,
  } = options.request;

  const browse = useRestSoupDataSource({
    enabled: () => options.enabled() && groupingActive(),
    params: soupParams,
    body: soupBody,
    groupBy: serverGroupByField,
    showSupportedForeignEntities,
    itemFilter: matchesActiveFilters,
  });
  const itemsQuery = browse.query;

  const groupedEntities = createMemo(() => {
    if (serverGroupByField()) {
      return [];
    }

    return options.transformEntities(
      [...(options.additionalEntities?.() ?? []), ...browse.items()],
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
    groupByField: serverGroupByField,
    soupParams,
    soupBody,
    graphqlReactive: () =>
      itemsQuery.transport === 'graphql' && serverGroupByField() !== undefined,
    queryOptions: () => ({
      enabled: options.enabled() && groupingActive(),
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

  const items = createMemo(() => {
    if (!options.enabled() || !groupingActive()) {
      return [];
    }

    const apiGroups = itemsQuery.data?.groups;
    if (serverGroupByField() && apiGroups && !itemsQuery.isPlaceholderData) {
      const groups = rawServerGroups(apiGroups).map((group) => ({
        ...group,
        entities: options.transformEntities(group.entities, { sort: true }),
      }));

      return buildServerSoupRows(groups);
    }

    const entities = groupedEntities();

    if (isClientDateGroup()) {
      return buildDateSoupRows(entities);
    }

    if (isClientPropertyGroup()) {
      const field = controls.groupByField();
      if (field?.type !== 'property') return [];

      return buildClientPropertySoupRows(entities, {
        propertyDefinitionId: field.propertyDefinitionId,
        stageIds: dealStages.stages().map((stage) => stage.id),
        resolveStage: (entity) =>
          dealStages.resolveStage(
            entity as Parameters<typeof dealStages.resolveStage>[0]
          ),
        labelFor: (id) => resolveGroupLabel(id, id),
      });
    }

    return [];
  });

  const dataSource = {
    items,
    isLoading: () => options.enabled() && browse.isLoading(),
    isFetching: () => options.enabled() && browse.isFetching(),
    error: () => (options.enabled() ? browse.error() : undefined),
    hasMore: () => options.enabled() && browse.hasMore(),
    isLoadingMore: () => options.enabled() && browse.isLoadingMore(),
    loadMore: async () => {
      if (!options.enabled()) return;

      if (!browse.hasMore()) return;

      await browse.loadMore();
    },
    refresh: async () => {
      if (!options.enabled()) return;

      groupQueries.resetToInitialPage();
      await browse.refresh();
    },
    active: groupingActive,
  } satisfies ListDataSource<SoupRow> & { [key: string]: unknown };

  return dataSource;
}
