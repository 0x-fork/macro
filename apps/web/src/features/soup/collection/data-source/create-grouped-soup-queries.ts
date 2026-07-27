import { createInfiniteQueries } from '@app/features/soup/collection/data-source/create-infinite-queries';
import { throwOnErr } from '@core/util/result';
import type { EntityData } from '@entity';
import { useQueryClient } from '@queries/client';
import { groupedCacheVersion } from '@queries/soup/cache';
import {
  makeGraphqlGroupedSoupContinuationInput,
  makeGraphqlGroupedSoupInput,
} from '@queries/soup/graphql-ast';
import {
  parseGroupMeta,
  serializeGroupByField,
} from '@queries/soup/grouped/api';
import { registerGroupedSoupContinuation } from '@queries/soup/grouped/graphql-operation-registry';
import type { GroupByField, GroupMeta } from '@queries/soup/grouped/types';
import type {
  SoupApiItemFilter,
  SoupAstBody,
  SoupAstItemsGroupedPage,
  SoupParams,
} from '@queries/soup/items';
import { soupKeys } from '@queries/soup/keys';
import {
  isDisplayableSoupItem,
  isInstructionsMdDoc,
  mapApiSoupItemToEntity,
} from '@queries/soup/transform-utils';
import { useInstructionsMdIdQuery } from '@queries/storage/instructions-md';
import { storageServiceClient } from '@service-storage/client';
import type { SoupApiItem } from '@service-storage/generated/schemas';
import { fetchGraphqlGroupedSoup } from '@service-storage/graphql-soup';
import type { InfiniteData } from '@tanstack/solid-query';
import {
  type Accessor,
  batch,
  createEffect,
  createMemo,
  createSignal,
  on,
  untrack,
} from 'solid-js';

type InitialGroupPage = {
  items: SoupAstItemsGroupedPage['items'];
  groups: GroupMeta[];
};

export type GroupQueryPage = {
  items: InitialGroupPage['items'];
  group: GroupMeta;
};

export type GroupQueryData = {
  entities: EntityData[];
};

type CreateGroupedSoupQueriesArgs = {
  initialPage: Accessor<InitialGroupPage | undefined>;
  groupByField: Accessor<GroupByField | undefined>;
  soupParams: Accessor<
    Omit<SoupParams, 'sort_method'> & {
      sort_method: Exclude<SoupParams['sort_method'], 'frecency'>;
    }
  >;
  soupBody: Accessor<SoupAstBody>;
  transport: Accessor<'rest' | 'graphql' | undefined>;
  queryOptions: Accessor<{
    enabled?: boolean;
    /**
     * Legacy callers filter mapped group pages during query selection. New
     * collection callers disable this and run every group through their shared
     * entity transformation pipeline instead.
     */
    filterSelectedItems?: boolean;
    showSupportedForeignEntities?: boolean;
    meta?: {
      groupBy?: GroupByField;
      groupKey?: string;
      itemFilter?: SoupApiItemFilter;
    };
  }>;
};

export function createGroupedSoupQueries(args: CreateGroupedSoupQueriesArgs) {
  const instructionsIdQuery = useInstructionsMdIdQuery();
  const queryClient = useQueryClient();

  const mapItemToEntity = (
    item: SoupApiItem,
    showSupportedForeignEntities: boolean
  ) => {
    if (!isDisplayableSoupItem(item)) return;
    if (isInstructionsMdDoc(item, instructionsIdQuery)) return;
    if (
      item.tag === 'foreignEntity' &&
      (!showSupportedForeignEntities ||
        item.data.foreignEntitySource !== 'github_pull_request')
    ) {
      return;
    }

    return mapApiSoupItemToEntity(item);
  };

  const mapPageToEntities = (
    page: GroupQueryPage,
    itemFilter: SoupApiItemFilter | undefined,
    showSupportedForeignEntities: boolean
  ): EntityData[] => {
    const entities: EntityData[] = [];

    for (const id of page.group.itemIds) {
      const item = page.items[id];
      if (!item) continue;
      if (itemFilter && !itemFilter(item)) continue;

      const entity = mapItemToEntity(item, showSupportedForeignEntities);
      if (entity) entities.push(entity);
    }

    return entities;
  };

  const combineGroupPages = (
    pages: GroupQueryPage[],
    itemFilter: SoupApiItemFilter | undefined,
    showSupportedForeignEntities: boolean
  ): GroupQueryData | undefined => {
    if (pages.length === 0) return;

    return {
      entities: pages.flatMap((page) =>
        mapPageToEntities(page, itemFilter, showSupportedForeignEntities)
      ),
    };
  };

  const makeInitialPage = (
    initialGroupedPage: InitialGroupPage,
    group: GroupMeta
  ): GroupQueryPage => {
    const groupItems: InitialGroupPage['items'] = {};
    for (const id of group.itemIds) {
      const item = initialGroupedPage.items[id];
      if (item) groupItems[id] = item;
    }
    return { items: groupItems, group };
  };

  const configs = createMemo(() => {
    const field = args.groupByField();
    const initialGroupedPage = args.initialPage();

    if (!field || !initialGroupedPage) {
      return [];
    }

    const options = args.queryOptions();

    return initialGroupedPage.groups.map((group) => {
      const initialPage = makeInitialPage(initialGroupedPage, group);

      return {
        key: group.key,
        queryKey: soupKeys.groupedGroup({
          params: args.soupParams(),
          body: args.soupBody(),
          groupBy: field,
          groupKey: group.key,
        }).queryKey,
        queryFn: async (ctx: { pageParam: string | null }) => {
          if (ctx.pageParam == null) {
            return initialPage;
          }

          if (args.transport() === 'graphql') {
            const continuationInput = makeGraphqlGroupedSoupContinuationInput({
              groupBy: field,
              groupKey: group.key,
              cursor: ctx.pageParam,
            });
            registerGroupedSoupContinuation(
              makeGraphqlGroupedSoupInput({
                params: args.soupParams(),
                body: args.soupBody(),
                groupBy: field,
              }),
              continuationInput
            );
            const response = await fetchGraphqlGroupedSoup(continuationInput);
            const nextGroup = response.groups.find(
              (candidate) => candidate.key === group.key
            );
            if (!nextGroup) {
              if (response.groups.length > 0) {
                throw new Error(
                  `GraphQL grouped Soup continuation omitted bin ${group.key}`
                );
              }

              return {
                items: {},
                group: {
                  ...group,
                  itemIds: [],
                  nextCursor: null,
                },
              };
            }

            return {
              items: response.items,
              group: {
                ...group,
                itemIds: nextGroup.itemIds,
                nextCursor: nextGroup.nextCursor,
              },
            };
          }

          const response = await throwOnErr(async () =>
            storageServiceClient.getGroupedSoupAstGroupPage({
              params: {
                cursor: ctx.pageParam,
                group_by: serializeGroupByField(field),
                group_key: group.key,
                limit: args.soupParams().limit,
                sort_method: args.soupParams().sort_method ?? undefined,
              },
              body: args.soupBody(),
            })
          );

          return {
            items: response.items,
            group: parseGroupMeta(response.group),
          };
        },
        getNextPageParam: (lastPage: GroupQueryPage): string | null => {
          return lastPage.group.nextCursor;
        },
        select: (pages: GroupQueryPage[]) =>
          combineGroupPages(
            pages,
            options.filterSelectedItems === false
              ? undefined
              : options.meta?.itemFilter,
            options.showSupportedForeignEntities ?? false
          ),
        initialData: {
          pages: [initialPage],
          pageParams: [null],
        },
        enabled: false,
        meta: {
          ...options.meta,
          groupBy: field,
          groupKey: group.key,
          normalize: false,
        },
        staleTime: Infinity,
      };
    });
  });

  const queries = createInfiniteQueries<
    GroupQueryPage,
    GroupQueryData | undefined
  >(configs);

  const [groupDataVersion, setGroupDataVersion] = createSignal(0);

  const list = createMemo(() =>
    queries.list().map((query) => ({
      ...query,
      data: () => {
        groupDataVersion();
        // External cache patches (optimistic property edits, WS inserts)
        // bump this since query.data is read untracked.
        groupedCacheVersion();
        return untrack(query.data);
      },
      fetchNextPage: async () => {
        const result = await query.fetchNextPage();
        setGroupDataVersion((version) => version + 1);
        return result;
      },
    }))
  );

  const map = createMemo(() => {
    const next = new Map<string, ReturnType<typeof list>[number]>();
    for (const query of list()) {
      next.set(query.key, query);
    }
    return next;
  });

  createEffect(
    on(
      () => args.initialPage(),
      (initialGroupedPage) => {
        const field = args.groupByField();
        if (!field || !initialGroupedPage) return;

        batch(() => {
          for (const group of initialGroupedPage.groups) {
            const initialPage = makeInitialPage(initialGroupedPage, group);
            const queryKey = soupKeys.groupedGroup({
              params: args.soupParams(),
              body: args.soupBody(),
              groupBy: field,
              groupKey: group.key,
            }).queryKey;

            queryClient.setQueryData<
              InfiniteData<GroupQueryPage, string | null>
            >(queryKey, {
              pages: [initialPage],
              pageParams: [null],
            });
          }

          setGroupDataVersion((version) => version + 1);
        });
      },
      { defer: true }
    )
  );

  return {
    ...queries,
    list,
    map,
  };
}
