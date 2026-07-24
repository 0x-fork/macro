import { defineQueryFilters } from '@app/features/next-soup/filters/filter-store';
import type {
  FacetSelection,
  SoupCollection,
  SoupCollectionInitialState,
  SoupCollectionSort,
} from '@app/features/soup/collection';
import { deserializeFacets } from '@app/features/soup/filtering/facet-store';
import type { CrmViewConfig } from '@companies/crm/saved-views';
import { batch } from 'solid-js';
import type { SoupViewContextValue } from '../../context';

/** Replacement-only fields layered onto the production CRM saved-view shape. */
export type SoupCompanyViewConfig = CrmViewConfig & {
  facets?: FacetSelection;
  sortState?: SoupCollectionSort[];
};

export type InitialSoupCompanyView = SoupCompanyViewConfig;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isClientFilters = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const filters = value as Record<string, unknown>;
  return (
    (filters.and === undefined || isStringArray(filters.and)) &&
    (filters.or === undefined || isStringArray(filters.or))
  );
};

const isSortState = (value: unknown): value is SoupCollectionSort[] =>
  Array.isArray(value) &&
  value.every(
    (sort) =>
      typeof sort === 'object' &&
      sort !== null &&
      typeof (sort as Record<string, unknown>).id === 'string' &&
      typeof (sort as Record<string, unknown>).reversed === 'boolean'
  );

/** Accept both production CRM configs and direction-aware replacement configs. */
export function isSoupCompanyViewConfig(
  value: unknown
): value is SoupCompanyViewConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  if (config.kind !== 'crm') return false;
  return (
    (config.facets === undefined ||
      (typeof config.facets === 'object' &&
        config.facets !== null &&
        !Array.isArray(config.facets))) &&
    (config.clientFilters === undefined ||
      isClientFilters(config.clientFilters)) &&
    (config.sortState === undefined || isSortState(config.sortState)) &&
    (config.sort === undefined || isStringArray(config.sort)) &&
    (config.stageFilter === undefined || isStringArray(config.stageFilter)) &&
    (config.ownerFilter === undefined || isStringArray(config.ownerFilter)) &&
    (config.searchText === undefined ||
      typeof config.searchText === 'string') &&
    (config.groupBy === undefined ||
      config.groupBy === null ||
      typeof config.groupBy === 'string') &&
    (config.viewMode === undefined ||
      config.viewMode === 'list' ||
      config.viewMode === 'board') &&
    (config.activeTab === undefined || typeof config.activeTab === 'string')
  );
}

const legacyHiddenSelection = (config: CrmViewConfig): boolean | undefined => {
  const predicateIds = [
    ...(config.clientFilters?.and ?? []),
    ...(config.clientFilters?.or ?? []),
  ];
  if (predicateIds.includes('crm-company-hidden')) return true;
  if (predicateIds.includes('crm-company-active')) return false;

  if (typeof config.filters !== 'object' || config.filters === null) {
    return undefined;
  }
  const include = (config.filters as Record<string, unknown>).include;
  if (typeof include !== 'object' || include === null) return undefined;
  const hidden = (include as Record<string, unknown>).crmCompanyHidden;
  return typeof hidden === 'boolean' ? hidden : undefined;
};

/** Recover the tab encoded by either the current or production saved format. */
export function requestedCompanyTab(
  config: SoupCompanyViewConfig
): string | undefined {
  if (config.activeTab) return config.activeTab;
  const hidden = legacyHiddenSelection(config);
  return hidden === undefined ? undefined : hidden ? 'hidden' : 'active';
}

const compatibilityFacets = (config: SoupCompanyViewConfig): FacetSelection => {
  const facets = deserializeFacets(config.facets);
  if (config.ownerFilter?.length) {
    facets.company_owner = [...config.ownerFilter];
  }
  if (config.stageFilter?.length) {
    facets.company_stage = [...config.stageFilter];
  }
  return facets;
};

export function resolveInitialCompanyView(
  config: InitialSoupCompanyView,
  options?: { allowedTab: (requested: string | undefined) => string }
) {
  const facets = compatibilityFacets(config);
  const requestedTab = requestedCompanyTab(config);
  const tab = options?.allowedTab(requestedTab) ?? requestedTab;
  if (tab) {
    facets.companies = [tab];
    facets.scope = [
      tab === 'hidden' ? 'crm-company-hidden' : 'crm-company-active',
    ];
  }
  const initialState: SoupCollectionInitialState = {
    facets,
    search: config.searchText,
    sort: config.sortState?.length
      ? config.sortState.map((sort) => ({ ...sort }))
      : config.sort,
    groupBy: config.groupBy ?? undefined,
    activeTab: tab,
  };

  return { initialState, viewMode: config.viewMode };
}

export function captureCompanyView(
  collection: Pick<SoupCollection, 'facets' | 'state'>,
  view: Pick<SoupViewContextValue, 'viewMode'>
): SoupCompanyViewConfig {
  const facets = collection.facets.serialize();
  const hidden = collection.state.activeTab === 'hidden';
  const legacyPreset = {
    filters: defineQueryFilters(
      { include: { crmCompanyHidden: hidden } },
      { skipTargets: ['ccf'] }
    ),
    clientFilters: {
      and: [hidden ? 'crm-company-hidden' : 'crm-company-active'],
    },
  };
  return {
    kind: 'crm',
    facets,
    // Keep links readable by production Soup while replacement routes are
    // still isolated behind /component/new-*.
    ...legacyPreset,
    searchText: collection.state.search,
    groupBy: collection.state.groupBy ?? null,
    sort: collection.state.sort.map((sort) => sort.id),
    sortState: collection.state.sort.map((sort) => ({ ...sort })),
    viewMode: view.viewMode(),
    activeTab: collection.state.activeTab,
    stageFilter: [...(facets.company_stage ?? [])],
    ownerFilter: [...(facets.company_owner ?? [])],
  };
}

export function applyCompanyView(
  collection: Pick<SoupCollection, 'facets' | 'setState'>,
  view: Pick<
    SoupViewContextValue,
    'activePresetFacets' | 'applyTabPreset' | 'setViewMode'
  >,
  config: SoupCompanyViewConfig,
  options: {
    allowedTab: (requested: string | undefined) => string;
    fallbackSort?: SoupCollectionSort[];
  }
) {
  const tab = options.allowedTab(requestedCompanyTab(config));
  const sort =
    config.sortState && config.sortState.length > 0
      ? config.sortState.map((item) => ({ ...item }))
      : config.sort?.length
        ? config.sort.map((id) => ({ id, reversed: false }))
        : (options.fallbackSort ?? [{ id: 'updated_at', reversed: false }]);

  batch(() => {
    // Apply the tab first so its server scope and permission-gated preset win
    // over stale active/hidden facets captured in older saved-view formats.
    view.applyTabPreset(tab);
    collection.facets.hydrate({
      ...compatibilityFacets(config),
      ...view.activePresetFacets(),
      companies: [tab],
    });
    collection.setState({
      search: config.searchText ?? '',
      groupBy: config.groupBy ?? undefined,
      sort,
      activeTab: tab,
    });
    view.setViewMode(config.viewMode ?? 'board');
  });
}
