import { ENABLE_SEARCH_SERVICE } from '@core/constant/featureFlags';
import { isErr } from '@core/util/maybeResult';
import { queryKeys, type WithSearch, type EntityData } from '@macro-entity';
import { type SearchArgs, searchClient } from '@service-search/client';
import type {
  MatchType,
  SearchOn,
  UnifiedSearchIndex,
} from '@service-search/generated/models';
import type {
  ChannelFilters,
  ChatFilters,
  DocumentFilters,
  EmailFilters,
  ParamsSortMethod,
  PostItemsSoupParams,
  PostSoupRequest,
  ProjectFilters,
  SoupPage,
} from '@service-storage/generated/schemas';
import { useInfiniteQuery } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import { SERVER_HOSTS } from '@core/constant/servers';
import { platformFetch } from '@core/util/platformFetch';
import { useInstructionsMdIdQuery } from '@queries/storage/instructions-md';
import {
  createApiTokenQuery,
  withApiTokenRetry,
  handleFetchResponse,
} from '../../../../macro-entity/src/queries/auth';
import {
  mapSoupPageToEntityList,
  useSearchResponseItemMapper,
} from '@app/component/next-unified-list/soup-query/map-entities';

const fetchSearchResults = async (args: SearchArgs) => {
  const res = await searchClient.search(args);
  if (isErr(res)) throw res[0];
  const [, data] = res;
  return data;
};

const fetchPaginatedDocumentsPost = async ({
  apiToken,
  params,
  requestBody,
  signal,
}: {
  apiToken?: string;
  requestBody?: PostSoupRequest;
  params?: PostItemsSoupParams;
  signal?: AbortSignal;
}) => {
  if (!apiToken) throw new Error('No API token provided');
  const Authorization = `Bearer ${apiToken}`;

  const url = new URL(`${SERVER_HOSTS['document-storage-service']}/items/soup`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value.toString());
    });
  }

  const response = await platformFetch(url, {
    headers: { Authorization, 'Content-Type': 'application/json' },
    method: 'POST',
    body: requestBody ? JSON.stringify(requestBody) : undefined,
    signal,
  });

  await handleFetchResponse(response, 'Failed to fetch documents');

  const result: SoupPage = await response.json();
  return result;
};

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

export const useSoupQuery = (
  args: Accessor<{
    params: EntitiesQueryParams;
    body: EntitiesQueryRequesdtBody;
  }>
) => {
  const params = createMemo(() => args());

  const pageSize = createMemo(() => params().params.page_size);

  const request = createMemo(() => params().body);

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
    const senders = params().body.email_filters?.senders;
    if (senders && senders.length > 0) return true;
    return false;
  });

  const enabled = createMemo(() => {
    if (!terms().length) return true;

    return ENABLE_SEARCH_SERVICE && validSearchTerms();
  });

  const mapSearchResponseItem = useSearchResponseItemMapper();
  const authQuery = createApiTokenQuery();
  const instructionsIdQuery = useInstructionsMdIdQuery();

  const query = useInfiniteQuery(() => ({
    queryKey: queryKeys.search({
      infinite: true,
      ...params(),
    }),
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
        return withApiTokenRetry(authQuery, (apiToken) =>
          fetchPaginatedDocumentsPost({
            apiToken,
            requestBody: {
              channel_filters,
              chat_filters,
              document_filters,
              email_filters,
              project_filters,
              limit,
              sort_method,
            },
            params: { cursor: ctx.pageParam.cursor ?? undefined },
          })
        );
      }

      return fetchSearchResults({
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
      });
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
