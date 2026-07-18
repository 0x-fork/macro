import {
  createDisclosureState,
  type DisclosureState,
} from '@app/components/list';
import type { SortConfig } from '@app/features/next-soup/create-sort-state';
import type { EntityData } from '@entity';
import { type Accessor, batch } from 'solid-js';
import { createStore } from 'solid-js/store';
import type { Facet, FacetSelection } from './facet-store';
import { createFacetStore } from './facet-store';
import type { FacetCtx } from './facets/base';

export type SoupFacetStore = ReturnType<typeof createFacetStore<FacetCtx>>;

export type SoupCollectionSort = {
  id: string;
  reversed: boolean;
};

export type SoupEmailView = 'inbox' | 'drafts' | 'sent' | 'all';

type SoupCollectionStore = {
  sort: SoupCollectionSort[];
  groupBy: string | undefined;
  search: string;
  searchPaused: boolean;
  activeTab: string | undefined;
  emailView: SoupEmailView | undefined;
};

export type SoupCollectionSetter<T> = (value: T | ((current: T) => T)) => T;

export type SoupCollectionControls = {
  facets: SoupFacetStore;
  resetFacets: () => void;

  sort: Accessor<SoupCollectionSort[]>;
  setSort: SoupCollectionSetter<SoupCollectionSort[]>;
  resetSort: () => void;

  groupBy: Accessor<string | undefined>;
  setGroupBy: SoupCollectionSetter<string | undefined>;
  disclosure: DisclosureState;
  resetGrouping: () => void;

  search: Accessor<string>;
  setSearch: SoupCollectionSetter<string>;
  searchPaused: Accessor<boolean>;
  setSearchPaused: SoupCollectionSetter<boolean>;
  resetSearch: () => void;

  activeTab: Accessor<string | undefined>;
  setActiveTab: SoupCollectionSetter<string | undefined>;
  emailView: Accessor<SoupEmailView | undefined>;
  setEmailView: SoupCollectionSetter<SoupEmailView | undefined>;
  resetViewState: () => void;
};

export type SoupCollectionInitialState = {
  facets?: FacetSelection;
  extraFacets?: readonly Facet<FacetCtx>[];
  sortIds?: string[];
  sort?: SoupCollectionSort[];
  groupBy?: string;
  collapsedGroups?: Iterable<string>;
  search?: string;
  activeTab?: string;
  emailView?: SoupEmailView;
};

export type CreateSoupCollectionStateOptions = {
  facets?: readonly Facet<FacetCtx>[];
  sortConfigs?: Record<string, SortConfig<EntityData, string>>;
  initialState?: SoupCollectionInitialState;
};

export type SoupCollectionState = SoupCollectionControls & {
  reset: () => void;
};

const storeSetter =
  <T>(get: Accessor<T>, set: (value: T) => void): SoupCollectionSetter<T> =>
  (value) => {
    const next =
      typeof value === 'function' ? (value as (current: T) => T)(get()) : value;
    set(next);
    return next;
  };

/** Creates local Soup controls independently from query transport wiring. */
export function createSoupCollectionState(
  options: CreateSoupCollectionStateOptions = {}
): SoupCollectionState {
  const initialState = options.initialState ?? {};
  const initialFacets: FacetSelection = {
    ...(initialState.facets ?? {}),
  };

  const facets = createFacetStore(options.facets ?? [], {
    initialSelection: initialFacets,
    initialExtraFacets: initialState.extraFacets,
  });

  const sortConfigs: Record<
    string,
    SortConfig<EntityData, string>
  > = options.sortConfigs ?? {};
  const initialSort: SoupCollectionSort[] = initialState.sort
    ? initialState.sort
        .filter((sort) => sortConfigs[sort.id] !== undefined)
        .map((sort) => ({ ...sort }))
    : (initialState.sortIds ?? [])
        .filter((id) => sortConfigs[id] !== undefined)
        .map((id) => ({ id, reversed: false }));
  const initialCollapsedGroups = [...(initialState.collapsedGroups ?? [])];

  const [state, setState] = createStore<SoupCollectionStore>({
    sort: initialSort,
    groupBy: initialState.groupBy,
    search: initialState.search ?? '',
    searchPaused: false,
    activeTab: initialState.activeTab,
    emailView: initialState.emailView,
  });

  const sort = () => state.sort;
  const setSort = storeSetter<SoupCollectionSort[]>(sort, (value) => {
    setState(
      'sort',
      value.filter((item) => sortConfigs[item.id] !== undefined)
    );
  });

  const groupBy = () => state.groupBy;
  const setGroupBy = storeSetter(groupBy, (value) => {
    setState('groupBy', value);
  });
  const disclosure = createDisclosureState({
    defaultExpanded: true,
    initialToggled: initialCollapsedGroups,
  });

  const search = () => state.search;
  const setSearch = storeSetter(search, (value) => setState('search', value));
  const searchPaused = () => state.searchPaused;
  const setSearchPaused = storeSetter(searchPaused, (value) =>
    setState('searchPaused', value)
  );

  const activeTab = () => state.activeTab;
  const setActiveTab = storeSetter(activeTab, (value) =>
    setState('activeTab', value)
  );
  const emailView = () => state.emailView;
  const setEmailView = storeSetter(emailView, (value) =>
    setState('emailView', value)
  );
  const resetFacets = () => facets.hydrate(initialFacets);
  const resetSort = () => setSort(initialSort.map((item) => ({ ...item })));
  const resetGrouping = () => {
    setGroupBy(initialState.groupBy);
    disclosure.reset();
    disclosure.collapseAll(initialCollapsedGroups);
  };
  const resetSearch = () => {
    setSearch(initialState.search ?? '');
    setSearchPaused(false);
  };
  const resetViewState = () => {
    setActiveTab(initialState.activeTab);
    setEmailView(initialState.emailView);
  };

  return {
    facets,
    resetFacets,
    sort,
    setSort,
    resetSort,
    groupBy,
    setGroupBy,
    disclosure,
    resetGrouping,
    search,
    setSearch,
    searchPaused,
    setSearchPaused,
    resetSearch,
    activeTab,
    setActiveTab,
    emailView,
    setEmailView,
    resetViewState,
    reset: () => {
      batch(() => {
        resetFacets();
        resetSort();
        resetGrouping();
        resetSearch();
        resetViewState();
      });
    },
  };
}
