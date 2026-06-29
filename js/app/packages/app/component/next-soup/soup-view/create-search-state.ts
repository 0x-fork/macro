import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import type { SoupState } from '@app/component/next-soup/create-soup-state';
import type { FilterContext } from '@app/component/next-soup/filters/configs/base';
import type { FacetSelection } from '@app/component/next-soup/filters/facet-store';
import {
  NIL_UUID,
  type QueryState,
} from '@app/component/next-soup/filters/filter-store';
import type { CallStatus } from '@app/component/next-soup/filters/filter-store/types';
import { useSearchContext } from '@app/component/next-soup/search-context';
import {
  createSoupFreshSearch,
  nameFuzzySearchFilter,
} from '@app/component/next-soup/search-utils';
import { useUserId } from '@core/context/user';
import { arrayEquals } from '@core/util/compareUtils';
import { debouncedDependent } from '@core/util/debounce';
import { type EntityData, isChannelEntity } from '@entity';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import {
  useSearchSoupQuery,
  validateSearchServiceText,
} from '@queries/soup/search';
import type {
  EntityFilters,
  PropertyFilter,
  UnifiedSearchRequest,
} from '@service-search/generated/models';
import { type Accessor, createMemo, on, type Setter } from 'solid-js';
import type { SearchTypeValue } from './filters-bar/search/search-filters-state';

// Map the tasks-view property filters (status/priority/assignee/custom) into the
// search request shape, mirroring the soup path so search and soup agree. Values
// are grouped by property id: multiple values on one property are OR'd (a task
// matches any of them), and different properties are AND'd. Select options go to
// option_ids, entity refs to entity_ids.
function includePropertiesToFilters(
  properties: QueryState['include']['properties']
): PropertyFilter[] {
  if (!properties?.length) return [];
  const byPropId = new Map<string, PropertyFilter>();
  for (const p of properties) {
    let filter = byPropId.get(p.propertyId);
    if (!filter) {
      filter = { property_definition_id: p.propertyId };
      byPropId.set(p.propertyId, filter);
    }
    if (p.type === 'select') {
      filter.option_ids = [...(filter.option_ids ?? []), p.value];
    } else {
      filter.entity_ids = [...(filter.entity_ids ?? []), p.value];
    }
  }
  return [...byPropId.values()];
}

// The "match nothing" id field per entity group — used to NIL-exclude every
// group except the active search type's (so search scopes to one entity type).
const NIL_FIELD = {
  document_filters: 'document_ids',
  email_filters: 'email_thread_ids',
  channel_filters: 'channel_ids',
  channel_thread_filters: 'thread_ids',
  chat_filters: 'chat_ids',
  project_filters: 'project_ids',
  call_filters: 'call_ids',
  foreign_entity_filters: 'ids',
} as const;

type EntityGroup = keyof typeof NIL_FIELD;

const ACTIVE_GROUP: Record<SearchTypeValue, EntityGroup | null> = {
  all: null,
  email: 'email_filters',
  channels: 'channel_filters',
  calls: 'call_filters',
  task: 'document_filters',
  'document-or-file': 'document_filters',
  folders: 'project_filters',
  agent: 'chat_filters',
};

export function buildSearchEntityFilters(
  selection: Partial<FacetSelection>
): EntityFilters {
  const {
    'search-type': searchType = [],
    'email-importance': emailImportance = [],
    'email-inbox': emailInbox = [],
    'channel-in': channelIn = [],
    'channel-from': channelFrom = [],
    'call-in': callIn = [],
    'call-from': callFrom = [],
    'call-status': callStatus = [],
    'task-status': taskStatus = [],
    'task-priority': taskPriority = [],
    assignee = [],
    'task-created-by': taskCreatedBy = [],
  } = selection;

  const type = (searchType[0] as SearchTypeValue | undefined) ?? 'all';

  if (type === 'all') {
    return {
      channel_thread_filters: { thread_ids: [NIL_UUID] },
      foreign_entity_filters: { ids: [NIL_UUID] },
    };
  }

  const active = ACTIVE_GROUP[type];
  const filters: EntityFilters = {};

  for (const group of Object.keys(NIL_FIELD) as EntityGroup[]) {
    if (group === active) {
      continue;
    }

    filters[group] = {
      [NIL_FIELD[group]]: [NIL_UUID],
    };
  }

  switch (type) {
    case 'email': {
      const ef: NonNullable<EntityFilters['email_filters']> = {};

      if (emailImportance.includes('important')) ef.importance = true;
      if (emailInbox.length) ef.link_ids = emailInbox;

      if (Object.keys(ef).length) filters.email_filters = ef;

      break;
    }

    case 'channels': {
      const cf: NonNullable<EntityFilters['channel_filters']> = {};

      if (channelIn.length) cf.channel_ids = channelIn;
      if (channelFrom.length) cf.sender_ids = channelFrom;

      if (Object.keys(cf).length) filters.channel_filters = cf;

      break;
    }

    case 'calls': {
      const cf: NonNullable<EntityFilters['call_filters']> = {};

      if (callIn.length) cf.channel_ids = callIn;
      if (callFrom.length) cf.speaker_ids = callFrom;

      const status = callStatus[0] as CallStatus | undefined;
      if (status) cf.status = status;

      if (Object.keys(cf).length) filters.call_filters = cf;

      break;
    }

    case 'task': {
      const df: NonNullable<EntityFilters['document_filters']> = {
        sub_types: ['task'],
      };

      if (taskCreatedBy.length) df.owners = taskCreatedBy;

      filters.document_filters = df;

      const properties = includePropertiesToFilters([
        ...taskStatus.map((value) => ({
          propertyId: SYSTEM_PROPERTY_IDS.STATUS,
          type: 'select' as const,
          value,
        })),
        ...taskPriority.map((value) => ({
          propertyId: SYSTEM_PROPERTY_IDS.PRIORITY,
          type: 'select' as const,
          value,
        })),
        ...assignee.map((value) => ({
          propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
          type: 'entity' as const,
          value,
        })),
      ]);

      if (properties.length) filters.property_filters = properties;

      break;
    }
  }

  return filters;
}

const SEARCH_SERVICE_DEBOUNCE_MS = 300;
const LOCAL_FUZZY_SEARCH_DEBOUNCE_MS = 20;
// Max number of non-channel local results to feature. Channels bypass this
// limit since they are only searched locally, not via the backend search service.
const FEATURED_COUNT = 3;

const freshSearch = createSoupFreshSearch();

interface CreateSearchStateArgs {
  soup: SoupState;
  inboxFilter: Accessor<string[] | undefined>;
  assignees: Accessor<string[]>;
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
  soup,
  inboxFilter,
  assignees,
  disableLocalSearch,
  searchPaused,
  searchText,
  setSearchText,
}: CreateSearchStateArgs) => {
  const notificationSource = useGlobalNotificationSource();
  const userId = useUserId();

  const getFilterContext = (): FilterContext => ({
    userId: userId(),
    notificationSource,
    assignees: assignees(),
  });

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
      const baseFilters = buildSearchEntityFilters(soup.facets.serialize());

      // The mail view scopes search to the selected inbox account(s). `[]` =
      // explicitly none → NIL so nothing matches; a subset → those accounts.
      const inboxes = inboxFilter();
      if (inboxes !== undefined) {
        baseFilters.email_filters = {
          ...baseFilters.email_filters,
          link_ids: inboxes.length ? inboxes : [NIL_UUID],
        };
      }

      // CRM is opt-in on the backend. A view includes CRM in search when its
      // `scope` facet selects a CRM company scope (active or hidden) — so the
      // Companies view searches CRM, while every other view (including the
      // global Search view) excludes it.
      const includeCrm =
        soup.facets.has('scope', 'crm-company-active') ||
        soup.facets.has('scope', 'crm-company-hidden');

      if (!includeCrm) {
        return {
          search_on: 'name_content',
          match_type: 'partial',
          query,
          filters: baseFilters,
        };
      }

      // CRM is opt-in on the backend. Search surfaces visible companies
      // everywhere except the admin Companies → Hidden tab, which selects the
      // `crm-company-hidden` scope to search the hidden set. Elsewhere
      // (Companies → Active) the scope is `crm-company-active` → visible only.
      // Non-CRM targets are already NIL-excluded by the Companies preset.
      const crmCompanyHidden = soup.facets.has('scope', 'crm-company-hidden');

      return {
        search_on: 'name_content',
        match_type: 'partial',
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
    soup.facets.getSelected('channel-in').length > 0 ||
    soup.facets.getSelected('channel-from').length > 0;

  const filteredLocalFuzzyResults = createMemo(() => {
    if (!localFuzzyResults()) return [];
    if (hasChannelQueryFilters()) return [];
    const ctx = getFilterContext();
    const results = localFuzzyResults().filter((e) => soup.facets.test(e, ctx));
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
