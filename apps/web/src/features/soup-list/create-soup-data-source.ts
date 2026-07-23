import type { ListDataSource } from '@app/components/list';
import type { ListView } from '@app/constants/list-views';
import {
  deduplicateEntities,
  scopeChannelNotificationsForEntity,
} from '@app/features/next-soup/utils';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  ENABLE_GRAPHQL_SOUP_FLAG,
  ENABLE_GRAPHQL_SOUP_OVERRIDE,
  ENABLE_NEW_INBOX_FLAG,
  ENABLE_NEW_INBOX_OVERRIDE,
} from '@core/constant/featureFlags';
import {
  type EntityData,
  isWithNotification,
  type Notification,
  toNotificationEntity,
} from '@entity';
import { useNotificationsForEntity } from '@notifications';
import { invalidateUserNotifications } from '@queries/notification/user-notifications';
import type { Accessor } from 'solid-js';
import { createMemo } from 'solid-js';
import { createGroupedSoupDataSource } from './create-grouped-soup-data-source';
import type { SoupCollectionControls } from './create-soup-collection-state';
import { createSoupSearchDataSource } from './create-soup-search-data-source';
import { createSoupEntityRow } from './soup-rows';
import { createSoupEntityTransformer } from './transform-soup-entities';
import type { SoupRow } from './types';
import { useReactiveSoupDataSource } from './use-reactive-soup-data-source';
import { useRestSoupDataSource } from './use-rest-soup-data-source';
import { useSoupBrowseRequest } from './use-soup-browse-request';

type SoupEntity = EntityData & { notifications?: Accessor<Notification[]> };

type EntityWithRawNotifications = EntityData & {
  notifications?: Notification[];
};

export type CreateSoupDataSourceOptions = {
  view: ListView;
  controls: SoupCollectionControls;
  enabled?: Accessor<boolean>;
  additionalEntities?: Accessor<EntityData[]>;
  disableLocalSearch?: Accessor<boolean>;
  limit?: Accessor<number>;
  sortConfigs: Record<
    string,
    { id: string; fn: (a: EntityData, b: EntityData) => number }
  >;
};

/**
 * Creates flat, grouped, and Search data sources and forwards the active one.
 * Soup-specific enrichment stays shared so every source transforms entities
 * through the same filtering, deduplication, notification, and sorting path.
 */
export function createSoupDataSource(options: CreateSoupDataSourceOptions) {
  const { controls } = options;
  const request = useSoupBrowseRequest(options);
  const {
    enabled,
    notificationSource,
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
  const newInbox = useFeatureFlag(ENABLE_NEW_INBOX_FLAG, {
    enabledOverride: ENABLE_NEW_INBOX_OVERRIDE,
  });
  const shouldScopeChannelNotifications = () =>
    options.view === 'inbox' && newInbox().enabled;

  const rawNotifications = (entity: EntityData) => {
    const value = (entity as EntityWithRawNotifications).notifications;
    return Array.isArray(value) ? value : undefined;
  };
  const notificationsForEntity = (
    entity: EntityData,
    notifications: Notification[]
  ) =>
    shouldScopeChannelNotifications()
      ? scopeChannelNotificationsForEntity(entity, notifications)
      : notifications;

  const attachNotifications = (entity: EntityData): SoupEntity => {
    if (isWithNotification(entity)) {
      return entity;
    }

    const raw = rawNotifications(entity);
    if (raw) {
      const { notifications: _notifications, ...withoutRaw } =
        entity as EntityWithRawNotifications;
      return {
        ...withoutRaw,
        notifications: () => notificationsForEntity(withoutRaw, raw),
      } as SoupEntity;
    }

    const notifications = useNotificationsForEntity(
      notificationSource,
      toNotificationEntity(entity)
    );
    return {
      ...entity,
      notifications: () => notificationsForEntity(entity, notifications()),
    } as SoupEntity;
  };

  const compareEntities = (left: SoupEntity, right: SoupEntity) => {
    for (const sort of controls.state.sort) {
      const result = options.sortConfigs[sort.id]?.fn(left, right) ?? 0;

      if (result !== 0) {
        return sort.reversed ? -result : result;
      }
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

  const searchSource = createSoupSearchDataSource({
    controls,
    enabled: () => enabled() && controls.state.search.trim().length > 0,
    facetContext,
    disableLocalSearch: options.disableLocalSearch,
    transformEntities,
  });

  const groupedSource = createGroupedSoupDataSource({
    controls,
    enabled: () => enabled() && !searchSource.active(),
    additionalEntities: options.additionalEntities,
    request,
    transformEntities,
  });

  const flatEnabled = () =>
    enabled() && !searchSource.active() && !groupedSource.active();

  const reactive = useReactiveSoupDataSource({
    enabled: () => flatEnabled() && graphqlSoup().enabled,
    params: soupParams,
    body: soupBody,
    showSupportedForeignEntities,
  });
  const useReactiveSource = () =>
    graphqlSoup().enabled && reactive.isSupported();

  const rest = useRestSoupDataSource({
    enabled: () => flatEnabled() && !useReactiveSource(),
    params: soupParams,
    body: soupBody,
    groupBy: () => undefined,
    showSupportedForeignEntities,
    itemFilter: matchesActiveFilters,
  });

  const activeFlatSource = createMemo<ListDataSource<EntityData>>(() =>
    useReactiveSource() ? reactive : rest
  );

  const flatEntities = createMemo(() =>
    transformEntities(
      [
        ...(options.additionalEntities?.() ?? []),
        ...activeFlatSource().items(),
      ],
      { sort: true }
    )
  );

  const flatSource = {
    items: createMemo(() => {
      if (!flatEnabled()) return [];

      return flatEntities().map((entity) => createSoupEntityRow(entity));
    }),
    isLoading: () => flatEnabled() && activeFlatSource().isLoading(),
    isFetching: () => flatEnabled() && activeFlatSource().isFetching(),
    error: () => (flatEnabled() ? activeFlatSource().error() : undefined),
    hasMore: () => flatEnabled() && activeFlatSource().hasMore(),
    isLoadingMore: () => flatEnabled() && activeFlatSource().isLoadingMore(),
    loadMore: async () => {
      if (!flatEnabled()) return;

      const source = activeFlatSource();
      if (!source.hasMore()) return;

      await source.loadMore();
    },
    refresh: async () => {
      if (!flatEnabled()) return;

      await activeFlatSource().refresh();
    },
  } satisfies ListDataSource<SoupRow>;

  const activeSource = (): ListDataSource<SoupRow> => {
    if (searchSource.active()) {
      return searchSource;
    }

    if (groupedSource.active()) {
      return groupedSource;
    }

    return flatSource;
  };

  const activeItems = createMemo<SoupRow[]>((previous) => {
    const source = activeSource();
    const next = [...source.items()];
    if (next.length > 0) return next;
    if (!source.isLoading() && !source.isFetching()) return next;
    return previous;
  }, []);

  const dataSource = {
    items: activeItems,
    isLoading: createMemo(() => activeSource().isLoading()),
    isFetching: () => activeSource().isFetching(),
    error: () => activeSource().error(),
    hasMore: () => activeSource().hasMore(),
    isLoadingMore: () => activeSource().isLoadingMore(),
    loadMore: () => activeSource().loadMore(),
    refresh: async () => {
      if (!enabled()) {
        return;
      }

      await Promise.all([
        activeSource().refresh(),
        invalidateUserNotifications(),
      ]);
    },
  } satisfies ListDataSource<SoupRow>;

  return dataSource;
}
