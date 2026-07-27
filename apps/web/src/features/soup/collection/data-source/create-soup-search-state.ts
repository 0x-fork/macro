import { useSearchContext } from '@app/features/soup/collection/data-source/search-context';
import {
  createSoupFreshSearch,
  nameFuzzySearchFilter,
} from '@app/features/soup/collection/data-source/search-utils';
import { arrayEquals } from '@core/util/compareUtils';
import { debouncedDependent } from '@core/util/debounce';
import { type EntityData, isChannelEntity } from '@entity';
import {
  useSearchSoupQuery,
  validateSearchServiceText,
} from '@queries/soup/search';
import type { UnifiedSearchRequest } from '@service-search/generated/models';
import { type Accessor, createMemo, on, type Setter } from 'solid-js';
import type { FacetCtx } from '../../filtering/facets';
import type { SoupFacets } from '../create-soup-collection-state';
import { buildSearchEntityFilters } from './build-soup-search-filters';

// A fully-quoted term searches exactly, not as a prefix. Quotes stay in the
// query so the backend tokenizer still groups a quoted phrase.
function isSingleQuotedTerm(query: string): boolean {
  const trimmed = query.trim();
  return (
    trimmed.length >= 2 &&
    trimmed.startsWith('"') &&
    trimmed.endsWith('"') &&
    trimmed.indexOf('"', 1) === trimmed.length - 1
  );
}

const SEARCH_SERVICE_DEBOUNCE_MS = 300;
const LOCAL_FUZZY_SEARCH_DEBOUNCE_MS = 20;
// Max number of non-channel local results to feature. Channels bypass this
// limit since they are only searched locally, not via the backend search service.
const FEATURED_COUNT = 3;

const freshSearch = createSoupFreshSearch();

interface CreateSearchStateArgs {
  facets: SoupFacets;
  facetContext: Accessor<FacetCtx>;
  disableLocalSearch?: Accessor<boolean>;
  searchPaused?: Accessor<boolean>;
  /**
   * Reactive search text. Owned by the caller so it can be wired to
   * per-entry navigation state and survive back/forward.
   */
  searchText: Accessor<string>;
  setSearchText: Setter<string>;
}

export const createSearchState = ({
  facets,
  facetContext,
  disableLocalSearch,
  searchPaused,
  searchText,
  setSearchText,
}: CreateSearchStateArgs) => {
  const trimmedSearchText = createMemo(() => searchText().trim());

  const debouncedSearchForLocal = debouncedDependent(
    trimmedSearchText,
    LOCAL_FUZZY_SEARCH_DEBOUNCE_MS
  );

  const debouncedSearchForService = debouncedDependent(
    trimmedSearchText,
    SEARCH_SERVICE_DEBOUNCE_MS
  );

  const isSearching = createMemo(() => trimmedSearchText().length > 0);

  const isSearchServiceDebounceSettled = createMemo(
    () => trimmedSearchText() === debouncedSearchForService()
  );

  const isSearchServiceDisabled = createMemo(
    () => !validateSearchServiceText(debouncedSearchForService())
  );

  const searchUnifiedNameContentRequest = createMemo(
    (): UnifiedSearchRequest => {
      const query = debouncedSearchForService();
      const baseFilters = buildSearchEntityFilters(facets.serialize(), {
        userId: facetContext().userId,
      });
      const matchType = isSingleQuotedTerm(query) ? 'exact' : 'partial';

      // CRM is opt-in on the backend. A view includes CRM in search when its
      // `scope` facet selects a CRM company scope (active or hidden) — so the
      // Companies view searches CRM, while every other view (including the
      // global Search view) excludes it.
      const includeCrm =
        facets.has('scope', 'crm-company-active') ||
        facets.has('scope', 'crm-company-hidden');

      if (!includeCrm) {
        return {
          search_on: 'name_content',
          match_type: matchType,
          query,
          filters: baseFilters,
        };
      }

      // CRM is opt-in on the backend. Search surfaces visible companies
      // everywhere except the admin Companies → Hidden tab, which selects the
      // `crm-company-hidden` scope to search the hidden set. Elsewhere
      // (Companies → Active) the scope is `crm-company-active` → visible only.
      // Non-CRM targets are already NIL-excluded by the Companies preset.
      const crmCompanyHidden = facets.has('scope', 'crm-company-hidden');

      return {
        search_on: 'name_content',
        match_type: matchType,
        query,
        include_crm: true,
        filters: {
          ...baseFilters,
          crm_company_filters: { hidden: crmCompanyHidden },
        },
      };
    }
  );

  const searchQuery = useSearchSoupQuery(
    () => ({
      params: {
        page_size: 100,
      },
      body: {
        ...searchUnifiedNameContentRequest(),
      },
    }),
    () => ({
      enabled:
        !isSearchServiceDisabled() &&
        isSearchServiceDebounceSettled() &&
        !searchPaused?.(),
    })
  );

  const { entityPool } = useSearchContext();

  const localFuzzyResults = createMemo(
    on(debouncedSearchForLocal, (query) => {
      if (disableLocalSearch?.()) return [];
      if (!query || query.length === 0) return [];
      const pool = entityPool();
      // TODO: we can optimize fresh search for small feature counts since we
      // don't need to sort everything, we just need the featured results
      const freshSearchResults = freshSearch(pool, query);
      // NOTE: this is a temporary hack because the fresh search fuzzy library
      // does not give us the highlighted matches
      const results = nameFuzzySearchFilter(
        freshSearchResults.map((r) => r.item.data),
        query
      );
      return results;
    })
  );

  // we will hide local results if there are channel filters because we only want message results
  const hasChannelQueryFilters = () =>
    facets.getSelected('channel_in').length > 0 ||
    facets.getSelected('channel_from').length > 0;

  const filteredLocalFuzzyResults = createMemo(() => {
    if (!localFuzzyResults()) return [];
    if (hasChannelQueryFilters()) return [];
    const results = localFuzzyResults().filter((entity) =>
      facets.test(entity, facetContext())
    );
    const channels = results.filter((e) => isChannelEntity(e));
    const nonChannels = results
      .filter((e) => !isChannelEntity(e))
      .slice(0, FEATURED_COUNT);
    return [...channels, ...nonChannels];
  });

  const serviceSearchResults = createMemo<EntityData[]>(() => {
    if (isSearchServiceDisabled()) return [];
    if (!isSearchServiceDebounceSettled()) return [];
    if (searchQuery.isFetching && !searchQuery.isFetchingNextPage) return [];
    return searchQuery.data ?? [];
  });

  const featuredIds = createMemo<string[]>(
    () => filteredLocalFuzzyResults().map((r) => r.id),
    [],
    { equals: arrayEquals }
  );

  const isLocalSearchSettling = createMemo(
    () => isSearching() && trimmedSearchText() !== debouncedSearchForLocal()
  );

  const isSearchServiceLoading = createMemo(() => {
    if (!isSearching()) return false;
    if (!validateSearchServiceText(trimmedSearchText())) return false;
    if (!isSearchServiceDebounceSettled()) return true;
    if (searchQuery.isFetching && !searchQuery.isFetchingNextPage) return true;
    return false;
  });

  return {
    searchText,
    setSearchText,
    isSearching,
    localFuzzyResults: filteredLocalFuzzyResults,
    serviceSearchResults,
    featuredIds,
    searchQuery,
    isSearchServiceLoading,
    isLocalSearchSettling,
  };
};
