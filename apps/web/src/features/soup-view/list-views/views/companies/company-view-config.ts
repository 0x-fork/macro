import type {
  FacetSelection,
  SoupCollection,
  SoupCollectionInitialState,
  SoupCollectionSort,
} from '@app/features/soup-list';
import type { CrmViewConfig } from '@companies/crm/saved-views';
import { batch } from 'solid-js';
import type { SoupViewContextValue, SoupViewMode } from '../../../context';

export type InitialSoupCompanyView = CrmViewConfig & {
  facets?: FacetSelection;
  sortState?: SoupCollectionSort[];
};

export function resolveInitialCompanyView(config: InitialSoupCompanyView) {
  const facets: FacetSelection = { ...(config.facets ?? {}) };
  if (config.ownerFilter?.length) {
    facets.company_owner = [...config.ownerFilter];
  }
  if (config.stageFilter?.length) {
    facets.company_stage = [...config.stageFilter];
  }

  const initialState: SoupCollectionInitialState = {
    facets,
    search: config.searchText,
    sort: config.sortState?.length
      ? config.sortState.map((sort) => ({ ...sort }))
      : config.sort,
    groupBy: config.groupBy ?? undefined,
    activeTab: config.activeTab,
  };

  return { initialState, viewMode: config.viewMode };
}

export type SoupCompanyViewConfig = {
  kind: 'crm';
  facets: FacetSelection;
  searchText: string;
  groupBy: string | null;
  /** Compatibility sort ids consumed by existing CRM share-link readers. */
  sort: string[];
  /** Facet replacement's direction-aware sort state. */
  sortState?: SoupCollectionSort[];
  viewMode: SoupViewMode;
  activeTab?: string;
  /** Compatibility fields for readers that have not migrated to facets. */
  stageFilter?: string[];
  ownerFilter?: string[];
};

export function isSoupCompanyViewConfig(
  value: unknown
): value is SoupCompanyViewConfig {
  if (typeof value !== 'object' || value === null) return false;
  const config = value as Record<string, unknown>;
  return (
    config.kind === 'crm' &&
    typeof config.facets === 'object' &&
    config.facets !== null &&
    typeof config.searchText === 'string' &&
    (typeof config.groupBy === 'string' || config.groupBy === null) &&
    Array.isArray(config.sort) &&
    config.sort.every((id) => typeof id === 'string') &&
    (config.sortState === undefined ||
      (Array.isArray(config.sortState) &&
        config.sortState.every(
          (sort) =>
            typeof sort === 'object' &&
            sort !== null &&
            typeof (sort as Record<string, unknown>).id === 'string' &&
            typeof (sort as Record<string, unknown>).reversed === 'boolean'
        ))) &&
    (config.viewMode === 'list' || config.viewMode === 'board') &&
    (config.activeTab === undefined || typeof config.activeTab === 'string')
  );
}

export function captureCompanyView(
  collection: Pick<SoupCollection, 'facets' | 'state'>,
  view: Pick<SoupViewContextValue, 'viewMode'>
): SoupCompanyViewConfig {
  const facets = collection.facets.serialize();
  return {
    kind: 'crm',
    facets,
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
  view: Pick<SoupViewContextValue, 'setViewMode'>,
  config: SoupCompanyViewConfig,
  options: {
    allowedTab: (requested: string | undefined) => string;
    fallbackSort?: SoupCollectionSort[];
  }
) {
  const tab = options.allowedTab(config.activeTab);
  const facets = collection.facets.deserialize(config.facets);
  facets.companies = [tab];

  const sort =
    config.sortState && config.sortState.length > 0
      ? config.sortState.map((item) => ({ ...item }))
      : config.sort.length > 0
        ? config.sort.map((id) => ({ id, reversed: false }))
        : (options.fallbackSort ?? [{ id: 'updated_at', reversed: false }]);

  batch(() => {
    collection.facets.hydrate(facets);
    collection.setState({
      search: config.searchText ?? '',
      groupBy: config.groupBy ?? undefined,
      sort,
      activeTab: tab,
    });
    view.setViewMode(config.viewMode ?? 'list');
  });
}
