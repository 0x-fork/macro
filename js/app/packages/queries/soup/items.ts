import { ENABLE_SEARCH_SERVICE } from '@core/constant/featureFlags';
import { throwOnErr } from '@core/util/maybeResult';
import type { EntityData, WithSearch } from '@macro-entity';
import { soupKeys } from '@queries/soup/keys';
import {
  mapSoupPageToEntityList,
  useSearchResponseItemMapper,
} from '@queries/soup/transform-utils';
import { useInstructionsMdIdQuery } from '@queries/storage/instructions-md';
import { searchClient } from '@service-search/client';
import type {
  UnifiedSearchIndex,
  MatchType,
  SearchOn,
} from '@service-search/generated/models';
import { storageServiceClient } from '@service-storage/client';
import type {
  ParamsSortMethod,
  ChannelFilters,
  ChatFilters,
  DocumentFilters,
  EmailFilters,
  ProjectFilters,
} from '@service-storage/generated/schemas';
import { useInfiniteQuery } from '@tanstack/solid-query';
import { createMemo, type Accessor } from 'solid-js';

interface EntitiesQueryParams {
  cursor?: string | null;
  page_size?: number;
}

interface EntitiesQueryRequesdtBody {
  limit?: number;
  sort_method?: ParamsSortMethod;

  search?: {
    collapse?: boolean | null;
    /** If search_on is set to NameContent, you can disable the recency filter
by setting to true. */
    disable_recency?: boolean;
    /** Include specific entity types from search. If empty, all entity types will be searched over. If you are unsure which types to search, use an empty array to search all. */
    include?: UnifiedSearchIndex[];
    /** How to match the search terms. 'exact' for precise case-sensitive phrase matches, 'partial' for prefix/partial matches. REQUIRED field. */
    match_type: MatchType;
    query?: string | null;
    /** Fields to search on (Name, Content, NameContent). Defaults to Content */
    search_on?: SearchOn;
    /** Multiple distinct search terms as separate strings. Use this for keyword-based searches where you want to find content containing any of these terms. Each term must be at least 3 characters (shorter terms are automatically filtered out). Examples: ['machine', 'learning', 'algorithms'], ['project', 'status', 'update']. `null` this field if searching without text terms to search all. This field matches query string against both name and content. */
    terms?: string[] | null;
  };

  /** the bundled [ChannelFilters] */
  channel_filters?: ChannelFilters;
  /** the bundled [ChatFilters] */
  chat_filters?: ChatFilters;
  /** the bundled [DocumentFilters] */
  document_filters?: DocumentFilters;
  /** the bundled [EmailFilters] */
  email_filters?: EmailFilters;
  /** the bundled [ProjectFilters] */
  project_filters?: ProjectFilters;
}

export type SoupQueryArgs = {
  params: EntitiesQueryParams;
  body: EntitiesQueryRequesdtBody;
};

export const useSoupQuery = (args: Accessor<SoupQueryArgs>) => {
  const pageSize = createMemo(() => args().params.page_size);

  const request = createMemo(() => args().body);

  const terms = createMemo(() => {
    const query = request().search?.query;
    const hasQuery = query && query.length > 0;
    const terms = request().search?.terms;
    const hasTerms = terms && terms.length > 0;
    if (hasTerms && hasQuery) {
      console.error('Cannot have both query and terms');
      return [];
    }
    if (hasTerms) {
      return terms;
    }
    if (hasQuery) {
      return [query];
    }
    return [];
  });

  const validSearchTerms = createMemo(() => {
    return terms().length > 0 && terms().every((term) => term.length >= 3);
  });

  const validSearchFilters = createMemo(() => {
    const senders = args().body.email_filters?.senders;
    if (senders && senders.length > 0) return true;
    return false;
  });

  const enabled = createMemo(() => {
    if (!terms().length) return true;

    return ENABLE_SEARCH_SERVICE && validSearchTerms() && validSearchFilters();
  });

  const mapSearchResponseItem = useSearchResponseItemMapper();
  const instructionsIdQuery = useInstructionsMdIdQuery();

  const query = useInfiniteQuery(() => ({
    queryKey: soupKeys.items(args()).queryKey,
    queryFn: async (ctx) => {
      const {
        email_filters,
        channel_filters,
        chat_filters,
        document_filters,
        limit,
        project_filters,
        search,
        sort_method,
      } = request();

      if (
        !search ||
        // !validSearchFilters() ||
        !validSearchTerms() ||
        !enabled()
      ) {
        return throwOnErr(
          async () =>
            await storageServiceClient.getSoupItems({
              params: { cursor: ctx.pageParam.cursor },
              body: {
                channel_filters,
                chat_filters,
                document_filters,
                email_filters,
                project_filters,
                limit,
                sort_method,
              },
            })
        );
      }

      return throwOnErr(
        async () =>
          await searchClient.search({
            params: ctx.pageParam,
            request: {
              ...search,
              filters: {
                channel: channel_filters,
                chat: chat_filters,
                document: document_filters,
                email: email_filters,
                project: project_filters,
              },
            },
          })
      );
    },
    initialPageParam: {
      cursor: null as string | null,
      page_size: pageSize(),
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage.next_cursor) return;
      return {
        cursor: lastPage.next_cursor,
        page_size: pageSize(),
      };
    },
    select: (data) => {
      const searchQuery = terms()[0];
      return data.pages.flatMap((page) => {
        if ('results' in page) {
          return page.results
            .map((result) => mapSearchResponseItem(result, searchQuery))
            .filter((entity): entity is WithSearch<EntityData> => !!entity);
        }
        return mapSoupPageToEntityList(page, { instructionsIdQuery });
      });
    },
    enabled: enabled(),
    placeholderData: (p) => p,
  }));

  return query;
};
