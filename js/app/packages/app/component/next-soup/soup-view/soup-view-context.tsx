import {
  getViewPreset,
  type PresetContext,
} from '@app/component/app-sidebar/soup-filter-presets';
import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import {
  createSoupState,
  type GroupMeta,
  type SoupEntity,
  type SoupRow,
  type SoupState,
} from '@app/component/next-soup/create-soup-state';
import type { FilterContext } from '@app/component/next-soup/filters/configs/';
import {
  type BackendAstMap,
  compileClause,
  compileFacets,
  defineClause,
  type FacetSelection,
  mergeAst,
  NIL_UUID,
} from '@app/component/next-soup/filters/facet-store';
import {
  EMAIL_INBOX,
  type FacetCtx,
} from '@app/component/next-soup/filters/facets';
import type { SetPredicatesInput } from '@app/component/next-soup/filters/filter-store/predicates-store';
import type { Query } from '@app/component/next-soup/filters/filter-store/query-store';
import { createGroupedSoupQueries } from '@app/component/next-soup/soup-view/create-grouped-soup-queries';
import { createSearchState } from '@app/component/next-soup/soup-view/create-search-state';
import { useTagOptions } from '@app/component/next-soup/soup-view/filters-bar/tag-filter';
import { dateBucket } from '@app/component/next-soup/soup-view/group-by-date';
import {
  INBOX_FILTER_ENTRY_KEY,
  registerInboxFilterSplit,
} from '@app/component/next-soup/soup-view/inbox-filter-controllers';
import {
  deduplicateEntities,
  scopeChannelNotificationsForEntity,
} from '@app/component/next-soup/utils';
import { useEntryState } from '@app/component/split-layout/entry-state';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import {
  isListViewID,
  type ListView,
  soupItemMatchesListView,
  soupItemMatchesTagFilter,
} from '@app/constants/list-views';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useDealStages } from '@companies/crm/deal-stages';
import {
  ENABLE_FEATURED_SEARCH_RESULTS,
  ENABLE_GRAPHQL_SOUP_FLAG,
  ENABLE_GRAPHQL_SOUP_OVERRIDE,
  ENABLE_NEW_INBOX_FLAG,
  ENABLE_NEW_INBOX_OVERRIDE,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_FLAG,
  ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE,
} from '@core/constant/featureFlags';
import { useUserContext, useUserId } from '@core/context/user';
import {
  COMPANY_STAGE_OPTIONS,
  type EntityData,
  getPropertyOptionLabel,
  isWithNotification,
  toNotificationEntity,
} from '@entity';
import { useNotificationsForEntity } from '@notifications';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { useQueryClient } from '@queries/client';
import type {
  GroupMeta as ApiGroupMeta,
  GroupByField,
} from '@queries/soup/grouped/types';
import type { SoupParams } from '@queries/soup/items';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { soupKeys } from '@queries/soup/keys';
import { useIsTeamAdmin } from '@queries/team/teams';
import type { EntityFilters } from '@service-search/generated/models';
import type { SoupPage } from '@service-storage/generated/schemas';
import type { InfiniteData } from '@tanstack/solid-query';
import {
  type Accessor,
  batch,
  createContext,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  type FlowComponent,
  on,
  onCleanup,
  type Setter,
  Suspense,
  useContext,
} from 'solid-js';

type DataSource<T> = {
  data: Accessor<T[]>;
  isLoading: Accessor<boolean>;
  isFetching: Accessor<boolean>;
  /**
   * True while the query is showing placeholder data from a previous query
   * key (e.g. the prior tab's rows) and fetching the real results. Used to
   * surface a loading indicator when switching between soup tabs.
   */
  isPlaceholderData: Accessor<boolean>;
  isFetchingNextPage: Accessor<boolean>;
  hasNextPage: Accessor<boolean>;
  fetchNextPage: VoidFunction;
};

type SoupViewInitializeOptions = {
  initialQuery?: Query;
  initialClientFilters?: SetPredicatesInput<string>;
  initialFacets?: FacetSelection;
  initialSearchText?: string;
  disableLocalSearch?: boolean;
  additionalEntities?: Accessor<EntityData[]>;
};

export type ReadFilter = 'all' | 'unread' | 'read';

interface SoupViewContextValues {
  soup: SoupState;
  initialize: (options?: SoupViewInitializeOptions) => void;
  source: DataSource<EntityData>;
  searchText: Accessor<string>;
  setSearchText: (value: string) => void;
  searchPaused: Accessor<boolean>;
  setSearchPaused: Setter<boolean>;
  featuredIds: Accessor<string[]>;
  items: Accessor<SoupEntity[]>;
  rows: Accessor<SoupRow[]>;
  isSearchServiceLoading: Accessor<boolean>;
  isLocalSearchSettling: Accessor<boolean>;
  assigneeFilter: Accessor<string[]>;
  setAssigneeFilter: (ids: string[]) => void;
  inboxFilter: Accessor<string[] | undefined>;
  setInboxFilter: Setter<string[] | undefined>;
  activeTab: Accessor<string | undefined>;
  setActiveTab: Setter<string | undefined>;
  readFilter: Accessor<ReadFilter>;
  setReadFilter: Setter<ReadFilter>;
  groupByField: Accessor<GroupByField | undefined>;
  fetchNextGroupPage: (groupKey: string) => Promise<void>;
  isFetchingGroupPage: (groupKey: string) => boolean;
  hasNextGroupPage: (groupKey: string) => boolean;
}

const SoupViewContext = createContext<SoupViewContextValues>();

export const useSoupView = () => {
  const context = useContext(SoupViewContext);

  if (!context) {
    throw new Error(
      'useSoupView can only be used under a SoupViewContext.Provider'
    );
  }

  return context;
};

export const useMaybeSoupView = () => useContext(SoupViewContext);

interface SoupViewContextProviderProps extends SoupViewInitializeOptions {
  soup?: SoupState;
  initialEnabled?: boolean;
}

type ApiSortMethod = Exclude<
  NonNullable<SoupParams['sort_method']>,
  'frecency'
>;
const VALID_API_SORT_METHODS: ApiSortMethod[] = [
  'viewed_at',
  'created_at',
  'updated_at',
  'viewed_updated',
];

export const SoupViewContextProvider: FlowComponent<
  SoupViewContextProviderProps
> = (props) => {
  const notificationSource = useGlobalNotificationSource();
  const userId = useUserId();
  const user = useUserContext();
  const isTeamAdmin = useIsTeamAdmin();
  const presetCtx = (): PresetContext => ({
    userId: user.userId(),
    isTeamAdmin: isTeamAdmin(),
  });
  const soup = props.soup ?? createSoupState();
  const [enabled, setEnabled] = createSignal(props.initialEnabled ?? false);
  const [config, setConfig] = createSignal<SoupViewInitializeOptions>({
    initialQuery: props.initialQuery,
    initialClientFilters: props.initialClientFilters,
    initialSearchText: props.initialSearchText,
    disableLocalSearch: props.disableLocalSearch,
    additionalEntities: props.additionalEntities,
  });

  const useGraphqlSoupFF = useFeatureFlag(ENABLE_GRAPHQL_SOUP_FLAG, {
    enabledOverride: ENABLE_GRAPHQL_SOUP_OVERRIDE,
  });
  // GraphQL soup transport: opt-in via flag, and only for the flat (non-grouped)
  // path — grouped queries stay on the default transport.
  const resolveTransport = (groupBy: GroupByField | undefined) =>
    useGraphqlSoupFF().enabled && !groupBy ? 'graphql' : undefined;

  const soupParams = createMemo(() => {
    const sortId = soup.sort.active()[0]?.id ?? 'updated_at';

    // Client-only sorts (priority, status) fall back to created_at for the API
    const sortMethod = VALID_API_SORT_METHODS.includes(sortId as ApiSortMethod)
      ? (sortId as ApiSortMethod)
      : 'created_at';

    return {
      limit: 100,
      sort_method: sortMethod,
    };
  });

  const panel = useSplitPanelOrThrow();
  const queryClient = useQueryClient();

  // Client-side predicate state (drives the "Type: X" chips and other
  // toggleable filters) also needs to round-trip per entry, since the chip UI
  // reads predicates directly and would otherwise show empty after back-nav.
  const predicatesCaptorTeardown = panel.handle.registerEntryStateCaptor(
    'search.predicates',
    (): SetPredicatesInput<string> => ({
      and: [...soup.predicates.andIds()],
      or: [...soup.predicates.orIds()],
    })
  );
  onCleanup(predicatesCaptorTeardown);

  // Menu refinements live in the facet store; round-trip them per entry too.
  const facetsCaptorTeardown = panel.handle.registerEntryStateCaptor(
    'search.facets',
    (): FacetSelection => soup.facets.serialize()
  );
  onCleanup(facetsCaptorTeardown);

  const [searchPaused, setSearchPaused] = createSignal(false);
  const sourceSearchPaused = createMemo(() => searchPaused() || !enabled());
  // assignee selection lives in the facet store (TASK_ASSIGNEE); persisted via
  // the `search.facets` captor like every other facet.
  const assigneeFilter = () => soup.facets.getSelected('assignee');
  const setAssigneeFilter = (ids: string[]) => soup.facets.set('assignee', ids);
  const [inboxFilter, setInboxFilter] = useEntryState<string[] | undefined>(
    INBOX_FILTER_ENTRY_KEY,
    { default: undefined }
  );

  // Expose the mail view's inbox filter to consumers outside the split tree
  // (the sidebar's nested account rows read and set it by split id). The
  // provider outlives content swaps within a split, so track the live content
  // reactively and (un)register as the mail list becomes / stops being the
  // shown view — registering also flushes any filter the sidebar queued while
  // navigating here, so a sidebar inbox selection takes on the first click.
  createEffect(() => {
    const content = panel.handle.content();
    if (content.type === 'component' && content.id === 'mail') {
      const dispose = registerInboxFilterSplit(panel.handle.id, {
        inboxFilter,
        setInboxFilter,
      });
      onCleanup(dispose);
    }
  });
  const [activeTab, setActiveTab] = useEntryState<string | undefined>(
    'soup.tab',
    { default: undefined }
  );
  const [readFilter, setReadFilter] = useEntryState<ReadFilter>(
    'soup.readFilter',
    { default: 'unread' }
  );

  const groupByField = createMemo((): GroupByField | undefined => {
    const id = soup.grouping.activeGroupId();
    if (!id) return undefined;
    // Date grouping is client-side (see the date branch in `rows()`): backend
    // date grouping is unreliable, so we keep paginating the single flat list
    // and regenerate buckets from whatever's loaded.
    if (id === 'date') return undefined;
    if (id === 'entity_type') return { type: 'entity_type' };
    if (id === 'project') return { type: 'project' };
    if (id.startsWith('property:')) {
      return {
        type: 'property',
        propertyDefinitionId: id.slice('property:'.length),
      };
    }
    return undefined;
  });

  const isClientDateGroup = createMemo(
    () => soup.grouping.activeGroupId() === 'date'
  );

  // CRM companies come back from a dedicated soup request that can't group by a
  // property server-side, so property grouping on the Customers view buckets
  // client-side over the flat list (same idea as date grouping). `groupByField`
  // stays populated so headers resolve the grouping property's labels/icons.
  const isClientPropertyGroup = createMemo(
    () =>
      activeListView() === 'companies' && groupByField()?.type === 'property'
  );
  // The group-by actually sent to the backend (drives the grouped queries).
  const serverGroupByField = createMemo(() =>
    isClientPropertyGroup() ? undefined : groupByField()
  );

  // Clear the assignee sub-filter when the task filter is off by either path:
  // the tasks-view preset (`scope` facet) or the inbox entity-type facet.
  createEffect(() => {
    const taskActive =
      soup.facets.has('scope', 'task') ||
      soup.facets.has('entity-type', 'task');
    if (!taskActive) setAssigneeFilter([]);
  });

  // Active deal-stage set (team-customized when present). Drives the
  // Customers view's stage grouping, stage filter and group labels.
  const dealStages = useDealStages();

  // `resolveStage` takes the minimal company shape; widen it to any soup
  // entity (non-companies resolve to undefined since they carry no stage).
  const resolveCompanyStage = (entity: EntityData): string | undefined =>
    dealStages.resolveStage(
      entity as Parameters<typeof dealStages.resolveStage>[0]
    );

  const activeListView = createMemo<ListView | undefined>(() => {
    const content = panel.handle.content();
    if (content.type !== 'component') return;
    return isListViewID(content.id) ? content.id : undefined;
  });

  // New-inbox: surface the channel threads the current user participates in (as
  // root sender, replier, or @-mention) via the backend `channelThreadParticipant`
  // filter — soup otherwise only surfaces whole channels — scope to missed calls,
  // and apply the read/unread toggle. These live outside the facet store, so
  // they're applied to both the soup body and the search request below.
  const newInboxFlag = useFeatureFlag(ENABLE_NEW_INBOX_FLAG, {
    enabledOverride: ENABLE_NEW_INBOX_OVERRIDE,
  });
  const isNewInbox = () =>
    activeListView() === 'inbox' && newInboxFlag().enabled;

  // The dynamic new-inbox filters, shared by the soup body and the search
  // request. `undefined` when the new inbox isn't active. `seen`: `true` = read,
  // `false` = unread, `undefined` = all.
  const newInboxParams = () =>
    isNewInbox()
      ? {
          participantId: userId(),
          seen: readFilter() === 'all' ? undefined : readFilter() === 'read',
        }
      : undefined;

  const activePreset = createMemo(() => {
    const view = activeListView();
    return view ? getViewPreset(view, activeTab(), presetCtx()) : undefined;
  });

  // Keep the active tab's inline baseline facets in the store so compile/test
  // resolve them alongside the catalog. Reactive — re-runs on view/tab change.
  createEffect(() => {
    soup.facets.setExtraFacets(activePreset()?.facets ?? []);
  });

  const inboxFacetAst = (): BackendAstMap => {
    const inboxes = inboxFilter();
    if (inboxes === undefined) return {};
    return compileFacets(
      { 'email-inbox': inboxes.length ? inboxes : [NIL_UUID] },
      [EMAIL_INBOX],
      {}
    );
  };

  // New-inbox filters that the inbox preset can't express statically: the
  // participant channel threads, missed calls, and the read/unread scope. The
  // preset confines channel threads and calls away, so `cthf`/`callf` replace
  // those NILs while the per-type `seen` clauses AND onto the base. No
  // participant (no signed-in user) ⇒ leave the preset's channel-thread NIL in
  // place (show none).
  const applyNewInboxFilters = (base: BackendAstMap): BackendAstMap => {
    const params = newInboxParams();
    if (!params) return base;

    const { participantId, seen } = params;

    // `restrict: false` keeps this a plain refinement.
    const dynamic = compileClause(
      defineClause(
        {
          callStatus: 'MISSED',
          ...(participantId
            ? { channelThreadParticipantId: [participantId] }
            : {}),
          ...(seen !== undefined
            ? {
                documentSeen: seen,
                emailSeen: seen,
                channelSeen: seen,
                chatSeen: seen,
                folderSeen: seen,
                foreignEntitySeen: seen,
              }
            : {}),
        },
        { restrict: false }
      )
    );

    const seenAst: BackendAstMap = {};
    for (const target of ['df', 'ef', 'chanf', 'cf', 'pf', 'fef'] as const) {
      const clause = dynamic[target];
      if (clause) seenAst[target] = clause;
    }

    const merged = mergeAst(base, seenAst);
    if (dynamic.cthf) merged.cthf = dynamic.cthf;
    if (dynamic.callf) merged.callf = dynamic.callf;
    return merged;
  };

  const newInboxSearchFilters = (): EntityFilters | undefined => {
    const params = newInboxParams();
    if (!params) return undefined;

    const { participantId, seen } = params;
    const filters: EntityFilters = {
      channel_thread_filters: participantId
        ? { participant_ids: [participantId] }
        : { thread_ids: [NIL_UUID] },
      call_filters: { status: 'MISSED' },
    };

    if (seen !== undefined) {
      const notification_filters = { seen };
      filters.document_filters = { notification_filters };
      filters.email_filters = { notification_filters };
      filters.channel_filters = { notification_filters };
      filters.chat_filters = { notification_filters };
      filters.project_filters = { notification_filters };
      filters.foreign_entity_filters = { notification_filters };
    }

    return filters;
  };

  // Tag definitions feed the `tag` facet's compile clause (option id → owning
  // property-definition id). Reactive, so the list re-filters once tags load.
  const tagOptions = useTagOptions();
  const facetCtx = (): FacetCtx => ({
    tagDefs: tagOptions.defByOption(),
    resolveCompanyStage,
  });

  const soupBody = createMemo(() => {
    const emailView = activePreset()?.filters?.emailView;
    return {
      ...applyNewInboxFilters(
        mergeAst(inboxFacetAst(), soup.facets.compile(facetCtx()))
      ),
      ...(emailView ? { emailView } : {}),
    };
  });

  // Changing a filter changes the query key. Trim the previous body's cached
  // pages back to the first page so returning to that filter state refetches a
  // fresh page 1 instead of restoring stale deep-paginated results.
  createEffect(
    on(
      soupBody,
      (_body, prevBody) => {
        if (!prevBody) return;
        const groupBy = serverGroupByField();
        queryClient.setQueryData(
          soupKeys.astItems({
            params: soupParams(),
            body: prevBody,
            groupBy,
            transport: resolveTransport(groupBy),
          }).queryKey,
          (prev: InfiniteData<SoupPage> | SoupPage | undefined) => {
            if (!prev || !('pages' in prev)) return prev;
            prev.pages.splice(1, prev.pages.length);
            return prev;
          }
        );
      },
      { defer: true }
    )
  );

  const [searchText, setSearchText] = useEntryState<string>('search.text', {
    default: props.initialSearchText ?? '',
  });

  const search = createSearchState({
    soup,
    inboxFilter,
    queryFilters: newInboxSearchFilters,
    assignees: assigneeFilter,
    disableLocalSearch: () => config().disableLocalSearch ?? false,
    searchPaused: sourceSearchPaused,
    searchText,
    setSearchText,
  });

  const initialize = (options: SoupViewInitializeOptions = {}) => {
    batch(() => {
      setConfig(options);
      soup.predicates.set(options.initialClientFilters ?? {});
      soup.facets.hydrate(options.initialFacets ?? {});
      setSearchText(options.initialSearchText ?? '');
      setEnabled(true);
    });
  };

  const showSupportedForeignEntitiesFF = useFeatureFlag(
    ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_FLAG,
    {
      enabledOverride: ENABLE_SUPPORTED_SOUP_FOREIGN_ENTITIES_OVERRIDE,
    }
  );
  // Create filter context for context-aware filter predicates
  const getFilterContext = (): FilterContext => ({
    userId: userId(),
    notificationSource,
    assignees: assigneeFilter(),
    resolveCompanyStage,
  });

  const attachNotifications = (entity: EntityData) => {
    const notifications = useNotificationsForEntity(
      notificationSource,
      toNotificationEntity(entity)
    );
    return {
      ...entity,
      notifications: () =>
        isNewInbox()
          ? scopeChannelNotificationsForEntity(entity, notifications())
          : notifications(),
    };
  };

  // Active tag option ids, used to gate optimistic websocket inserts so an
  // active tag filter is honored even on the grouped render path.
  const activeTagOptionIds = createMemo(() => soup.facets.getSelected('tag'));

  const itemsQuery = useSoupAstItemsQuery(
    () => {
      const groupBy = serverGroupByField();
      return {
        params: soupParams(),
        body: soupBody(),
        groupBy,
        transport: resolveTransport(groupBy),
      };
    },
    () => {
      const view = activeListView();
      return {
        enabled: enabled() && !search.isSearching(),
        showSupportedForeignEntities: showSupportedForeignEntitiesFF().enabled,
        meta: {
          itemFilter: (item) =>
            soupItemMatchesListView(item, view) &&
            soupItemMatchesTagFilter(item, activeTagOptionIds()),
        },
      };
    }
  );

  const items = createMemo<SoupEntity[]>(
    (prev) => {
      const searching = search.isSearching();

      if (!searching) {
        const data = itemsQuery.data;

        if (!data || data.groups) return prev;

        const base = data.entities.map((e) =>
          isWithNotification(e) ? e : attachNotifications(e)
        ) as SoupEntity[];

        const extras = config().additionalEntities?.() ?? [];

        if (extras.length === 0) return base;

        const extraEntities = extras.map((e) =>
          isWithNotification(e) ? e : attachNotifications(e)
        ) as SoupEntity[];

        return [...extraEntities, ...base];
      }

      const local = search.localFuzzyResults();
      const service = search.serviceSearchResults();

      const merged: SoupEntity[] = [...service, ...local];

      if (
        merged.length === 0 &&
        prev.length > 0 &&
        search.isLocalSearchSettling()
      ) {
        return prev;
      }

      for (let i = 0; i < merged.length; i++) {
        const entity = merged[i];
        if (entity.notifications) continue;
        merged[i] = attachNotifications(entity);
      }

      return merged;
    },
    [],
    {
      equals: false,
    }
  );

  const baseEntities = () => {
    let transformed = items();
    const ctx = getFilterContext();

    const next = [];
    for (const entity of transformed) {
      if (!soup.facets.test(entity, ctx)) continue;
      next.push(entity);
    }

    transformed = deduplicateEntities(next);

    const sorts = soup.sort.active();
    if (sorts.length > 0 && !search.isSearching()) {
      transformed.sort((a, b) => {
        for (const sort of sorts) {
          const result = sort.fn(a, b);
          if (result !== 0) return result;
        }
        return 0;
      });
    }

    return transformed;
  };

  const entities = () => {
    const base = baseEntities();
    if (!ENABLE_FEATURED_SEARCH_RESULTS || !search.isSearching()) return base;

    const featuredIds = search.featuredIds();
    if (featuredIds.length === 0) return base;

    const entityMap = new Map(base.map((e) => [e.id, e]));
    const featuredIdSet = new Set(featuredIds);
    const featured: SoupEntity[] = [];

    for (const id of featuredIds) {
      const e = entityMap.get(id);
      if (e) featured.push(e);
    }

    const rest = base.filter((e) => !featuredIdSet.has(e.id));

    return [...featured, ...rest];
  };

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
    queryOptions: () => {
      const view = activeListView();
      return {
        enabled: enabled() && !search.isSearching(),
        meta: {
          itemFilter: (item) =>
            soupItemMatchesListView(item, view) &&
            soupItemMatchesTagFilter(item, activeTagOptionIds()),
        },
      };
    },
  });

  const groupQueryFor = (groupKey: string) => groupQueries.map().get(groupKey);

  const fetchNextGroupPage = async (groupKey: string) => {
    await groupQueryFor(groupKey)?.fetchNextPage();
  };

  const isFetchingGroupPage = (groupKey: string) =>
    groupQueryFor(groupKey)?.isFetchingNextPage() ?? false;

  const hasNextGroupPage = (groupKey: string) =>
    groupQueryFor(groupKey)?.hasNextPage() ?? false;

  // True when grouping by the canonical Stage id (the "group by Stage"
  // presets always use the system definition id, even when the team's own
  // stage set is active).
  const isStageGrouping = () => {
    const field = groupByField();
    return (
      field?.type === 'property' &&
      field.propertyDefinitionId === SYSTEM_PROPERTY_IDS.STAGE
    );
  };

  // Group-key → label, preferring the active deal-stage set for stage
  // groupings (custom option ids are unknown to the static option table).
  const resolveGroupLabel = (key: string): string | undefined => {
    if (isStageGrouping()) {
      return dealStages.stageLabel(key) ?? getPropertyOptionLabel(key);
    }
    return getPropertyOptionLabel(key);
  };

  const buildGroupMeta = (group: ApiGroupMeta): GroupMeta => {
    const resolvedLabel = resolveGroupLabel(group.key) ?? group.label;
    return {
      key: group.key,
      value: group.key,
      label: resolvedLabel,
      count: group.totalCount,
      isExpanded: () => soup.grouping.isExpanded(group.key),
      toggle: () => soup.grouping.toggle(group.key),
    };
  };

  // Group key an entity falls under for a property grouping: the first
  // select-option id / entity-reference id, or '' for "Not set".
  const clientPropertyGroupKey = (
    entity: SoupEntity,
    propertyDefinitionId: string
  ): string => {
    const properties = 'properties' in entity ? (entity.properties ?? []) : [];
    const property = properties.find(
      (p) => p.definition.id === propertyDefinitionId
    );
    const value = property?.value;
    if (!value) return '';
    if (value.type === 'SelectOption' || value.type === 'Link') {
      const first = value.value[0];
      return typeof first === 'string' ? first : '';
    }
    if (value.type === 'EntityReference') {
      const first = value.value[0];
      return first && typeof first === 'object' && 'entity_id' in first
        ? String(first.entity_id)
        : '';
    }
    return '';
  };

  const rows = createMemo((): SoupRow[] => {
    const field = groupByField();
    const groups = itemsQuery.data?.groups;

    // Client-side property grouping (Customers view): bucket the flat
    // (paginated) list by property value; option order comes from the
    // statically-known stage options, then label, with "Not set" last.
    if (enabled() && isClientPropertyGroup() && !search.isSearching()) {
      const definitionId =
        field?.type === 'property' ? field.propertyDefinitionId : '';
      // Stage grouping resolves through the active deal-stage set so legacy
      // system-stage values land in the matching custom-stage bucket.
      const isStage = definitionId === SYSTEM_PROPERTY_IDS.STAGE;
      const buckets = new Map<string, SoupEntity[]>();
      for (const entity of entities()) {
        const key = isStage
          ? (resolveCompanyStage(entity) ?? '')
          : clientPropertyGroupKey(entity, definitionId);
        const bucket = buckets.get(key);
        if (bucket) {
          bucket.push(entity);
        } else {
          buckets.set(key, [entity]);
        }
      }

      const stageOrder = isStage
        ? dealStages.stages().map((stage) => stage.id)
        : COMPANY_STAGE_OPTIONS.map((o) => o.value as string);
      const order = [...buckets.keys()].sort((a, b) => {
        if (a === '') return 1;
        if (b === '') return -1;
        const aStage = stageOrder.indexOf(a);
        const bStage = stageOrder.indexOf(b);
        if (aStage !== -1 || bStage !== -1) {
          return (
            (aStage === -1 ? stageOrder.length : aStage) -
            (bStage === -1 ? stageOrder.length : bStage)
          );
        }
        const aLabel = resolveGroupLabel(a) ?? a;
        const bLabel = resolveGroupLabel(b) ?? b;
        return aLabel.localeCompare(bLabel);
      });

      const groupedRows: SoupRow[] = [];
      let index = 0;
      for (const key of order) {
        const groupEntities = buckets.get(key)!;
        const groupMeta: GroupMeta = {
          key,
          value: key,
          label: key === '' ? 'Not set' : (resolveGroupLabel(key) ?? key),
          count: groupEntities.length,
          isExpanded: () => soup.grouping.isExpanded(key),
          toggle: () => soup.grouping.toggle(key),
        };
        groupedRows.push(
          soup.buildRow({
            id: `header:${key}`,
            index: index++,
            original: groupEntities[0],
            group: groupMeta,
            isGrouped: true,
          })
        );
        for (const entity of groupEntities) {
          groupedRows.push(
            soup.buildRow({
              id: entity.id,
              index: index++,
              original: entity,
              group: groupMeta,
            })
          );
        }
      }
      return groupedRows;
    }

    // Client-side date grouping: reuse the single flat (paginated) list and
    // regenerate date buckets from whatever's loaded — no per-group fetching.
    if (enabled() && isClientDateGroup() && !search.isSearching()) {
      const all = entities();
      const buckets = new Map<
        string,
        { label: string; entities: SoupEntity[] }
      >();
      const order: string[] = [];
      const now = new Date();

      for (const entity of all) {
        const ts = entity.sortTs ?? entity.updatedAt ?? entity.createdAt;
        const bucket = dateBucket(ts, now);
        let group = buckets.get(bucket.key);

        if (!group) {
          group = { label: bucket.label, entities: [] };
          buckets.set(bucket.key, group);
          order.push(bucket.key);
        }

        group.entities.push(entity);
      }

      const dateRows: SoupRow[] = [];
      let index = 0;
      for (const key of order) {
        const group = buckets.get(key)!;
        const groupMeta: GroupMeta = {
          key,
          value: key,
          label: group.label,
          count: group.entities.length,
          isExpanded: () => soup.grouping.isExpanded(key),
          toggle: () => soup.grouping.toggle(key),
        };
        dateRows.push(
          soup.buildRow({
            id: `header:${key}`,
            index: index++,
            original: group.entities[0],
            group: groupMeta,
            isGrouped: true,
          })
        );
        for (const entity of group.entities) {
          dateRows.push(
            soup.buildRow({
              id: entity.id,
              index: index++,
              original: entity,
              group: groupMeta,
            })
          );
        }
      }
      return dateRows;
    }

    if (!enabled() || !field || !groups || search.isSearching()) {
      return entities().map((entity, index) =>
        soup.buildRow({ id: entity.id, index, original: entity })
      );
    }

    const result: SoupRow[] = [];
    let globalIndex = 0;

    for (const apiGroup of groups) {
      const groupMeta = buildGroupMeta(apiGroup);
      const groupData = groupQueryFor(apiGroup.key)?.data();
      const groupEntities =
        groupData?.entities?.map(
          (entity) =>
            (isWithNotification(entity)
              ? entity
              : attachNotifications(entity)) as SoupEntity
        ) ?? [];

      const firstEntity = groupEntities[0];
      if (!firstEntity) continue;

      result.push(
        soup.buildRow({
          id: `header:${apiGroup.key}`,
          index: globalIndex++,
          original: firstEntity,
          group: groupMeta,
          isGrouped: true,
        })
      );

      for (const entity of groupEntities) {
        result.push(
          soup.buildRow({
            id: entity.id,
            index: globalIndex++,
            original: entity,
            group: groupMeta,
          })
        );
      }

      if (!hasNextGroupPage(apiGroup.key)) continue;

      const lastEntity = groupEntities[groupEntities.length - 1];
      result.push(
        soup.buildRow({
          id: `loadmore:${apiGroup.key}`,
          index: globalIndex++,
          original: lastEntity,
          group: groupMeta,
          isLoadMore: true,
        })
      );
    }

    return result;
  });

  const { searchQuery } = search;

  const context = {
    soup,
    initialize,
    source: {
      data: entities,
      isLoading: () => itemsQuery.isLoading,
      isFetching: () => itemsQuery.isFetching || searchQuery.isFetching,
      isPlaceholderData: () =>
        itemsQuery.isPlaceholderData && !search.isSearching(),
      isFetchingNextPage: () =>
        itemsQuery.isFetchingNextPage || searchQuery.isFetchingNextPage,
      hasNextPage: () => {
        if (!enabled()) return false;

        return (
          (itemsQuery.isEnabled && itemsQuery.hasNextPage) ||
          (searchQuery.isEnabled && searchQuery.hasNextPage)
        );
      },
      fetchNextPage: () => {
        if (!enabled()) return;

        if (itemsQuery.isEnabled) {
          itemsQuery.fetchNextPage();
        }
        if (searchQuery.isEnabled) {
          searchQuery.fetchNextPage();
        }
      },
    },
    items,
    rows,
    searchText: search.searchText,
    setSearchText: search.setSearchText,
    searchPaused: sourceSearchPaused,
    setSearchPaused,
    featuredIds: search.featuredIds,
    isSearchServiceLoading: search.isSearchServiceLoading,
    isLocalSearchSettling: search.isLocalSearchSettling,
    assigneeFilter,
    setAssigneeFilter,
    inboxFilter,
    setInboxFilter,
    activeTab,
    setActiveTab,
    readFilter,
    setReadFilter,
    groupByField,
    fetchNextGroupPage,
    isFetchingGroupPage,
    hasNextGroupPage,
  };

  return (
    <SoupViewContext.Provider value={context}>
      {props.children}
      <Suspense>
        <SyncWithSoup soup={soup} rows={rows()} />
      </Suspense>
    </SoupViewContext.Provider>
  );
};

interface SyncWithSoupProps {
  soup: SoupState;
  rows: SoupRow[];
}

const SyncWithSoup = (props: SyncWithSoupProps) => {
  createRenderEffect(on(() => props.rows, props.soup.setRows));

  return null;
};
