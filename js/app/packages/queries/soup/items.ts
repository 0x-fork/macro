import { throwOnErr } from '@core/util/maybeResult';
import type { EntityData } from '@macro-entity';
import { soupKeys } from '@queries/soup/keys';
import { mapSoupPageToEntityList } from '@queries/soup/transform-utils';
import type { SoupQueryFilters } from '@queries/soup/types';
import { useInstructionsMdIdQuery } from '@queries/storage/instructions-md';
import { storageServiceClient } from '@service-storage/client';
import type { ParamsSortMethod } from '@service-storage/generated/schemas';
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
} from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

export type SoupItemsQueryArgs = {
  params: {
    limit?: number;
    sort_method?: ParamsSortMethod;
  };
  body: SoupQueryFilters;
};

export type UseSoupQueyResult = UseInfiniteQueryResult<EntityData[], Error>;

interface SoupItemsQueryOptions {
  enabled: boolean;
}

export const useSoupItemsQuery = (
  args: Accessor<SoupItemsQueryArgs>,
  options?: Accessor<SoupItemsQueryOptions>
) => {
  const instructionsIdQuery = useInstructionsMdIdQuery();

  return useInfiniteQuery(() => ({
    queryKey: soupKeys.items(args()).queryKey,
    queryFn: async (ctx) => {
      const { params, body } = args();

      return throwOnErr(
        async () =>
          await storageServiceClient.getSoupItems({
            params: { cursor: ctx.pageParam },
            body: {
              ...body,
              ...params,
            },
          })
      );
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.next_cursor) return;
      return lastPage.next_cursor;
    },
    select: (data) => {
      return data.pages.flatMap((page) => {
        return mapSoupPageToEntityList(page, { instructionsIdQuery });
      });
    },
    enabled: options?.().enabled,
    placeholderData: (p) => p,
  }));
};
