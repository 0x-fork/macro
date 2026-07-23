import type { SortConfig } from '@app/features/next-soup/create-sort-state';
import {
  makePersistedState,
  type PersistedOptions,
} from '@core/state/persistence';
import type { EntityData } from '@entity';
import type { GroupByField } from '@queries/soup/grouped/types';
import { type Accessor, createMemo, createSignal } from 'solid-js';
import {
  createStore,
  produce,
  reconcile,
  type SetStoreFunction,
  type Store,
} from 'solid-js/store';
import {
  compileFacets,
  deserializeFacets,
  type Facet,
  type FacetSelection,
  serializeFacets,
  testFacets,
} from './facet-store';
import type { FacetCtx } from './facets/base';

export type SoupCollectionSort = {
  id: string;
  reversed: boolean;
};

export type SoupEmailView = 'inbox' | 'drafts' | 'sent' | 'all';

export type SoupCollectionStore = {
  facets: FacetSelection;
  sort: SoupCollectionSort[];
  groupBy: string | undefined;
  collapsedGroups: string[];
  search: string;
  searchPaused: boolean;
  activeTab: string | undefined;
  emailView: SoupEmailView | undefined;
};

export type SoupFacets = {
  has: (facetId: string, optionId: string) => boolean;
  getSelected: (facetId: string) => string[];
  toggle: (facetId: string, optionId: string) => void;
  set: (facetId: string, optionIds: readonly string[]) => void;
  hydrate: (selection: FacetSelection) => void;
  serialize: () => FacetSelection;
  deserialize: (raw: unknown) => FacetSelection;
  compile: (ctx?: FacetCtx) => ReturnType<typeof compileFacets<FacetCtx>>;
  test: (entity: EntityData, ctx?: FacetCtx) => boolean;
  setExtraFacets: (facets: readonly Facet<FacetCtx>[]) => void;
};

export type SoupCollapsedGroups = {
  isExpanded: (id: string) => boolean;
  toggle: (id: string) => void;
  expandAll: () => void;
};

export type SoupCollectionControls = {
  state: Store<SoupCollectionStore>;
  setState: SetStoreFunction<SoupCollectionStore>;
  facets: SoupFacets;
  groupByField: Accessor<GroupByField | undefined>;
  collapsedGroups: SoupCollapsedGroups;
};

export type SoupCollectionInitialState = {
  facets?: FacetSelection;
  extraFacets?: readonly Facet<FacetCtx>[];
  sort?: string[] | SoupCollectionSort[];
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
  persistence?: PersistedOptions<SoupCollectionStore>;
};

export type SoupCollectionState = SoupCollectionControls & {
  reset: () => void;
};

const resolveGroupByField = (
  groupBy: string | undefined
): GroupByField | undefined => {
  if (groupBy === 'date') return { type: 'date' };
  if (groupBy === 'entity_type') return { type: 'entity_type' };
  if (groupBy === 'project') return { type: 'project' };
  if (groupBy?.startsWith('property:')) {
    return {
      type: 'property',
      propertyDefinitionId: groupBy.slice('property:'.length),
    };
  }
};

/** Creates local Soup controls independently from query transport wiring. */
export function createSoupCollectionState(
  options: CreateSoupCollectionStateOptions = {}
): SoupCollectionState {
  const initialState = options.initialState ?? {};
  const initialFacets: FacetSelection = {
    ...(initialState.facets ?? {}),
  };
  const facetDefinitions = options.facets ?? [];
  const [extraFacets, setExtraFacets] = createSignal<
    readonly Facet<FacetCtx>[]
  >(initialState.extraFacets ?? []);
  const activeFacetDefinitions = createMemo<readonly Facet<FacetCtx>[]>(() => [
    ...facetDefinitions,
    ...extraFacets(),
  ]);

  const sortConfigs: Record<
    string,
    SortConfig<EntityData, string>
  > = options.sortConfigs ?? {};
  const initialSort = (initialState.sort ?? []).flatMap((sort) => {
    const value =
      typeof sort === 'string' ? { id: sort, reversed: false } : sort;
    return sortConfigs[value.id] ? [{ ...value }] : [];
  });
  const initialCollapsedGroups = [...(initialState.collapsedGroups ?? [])];
  const getInitialStoreState = (): SoupCollectionStore => ({
    facets: Object.fromEntries(
      Object.entries(initialFacets).map(([id, optionIds]) => [
        id,
        [...optionIds],
      ])
    ),
    sort: initialSort.map((sort) => ({ ...sort })),
    groupBy: initialState.groupBy,
    collapsedGroups: [...initialCollapsedGroups],
    search: initialState.search ?? '',
    searchPaused: false,
    activeTab: initialState.activeTab,
    emailView: initialState.emailView,
  });

  const rawStore = createStore<SoupCollectionStore>(getInitialStoreState());
  const [state, setStore] = options.persistence
    ? makePersistedState(rawStore, options.persistence)
    : rawStore;
  const setState = setStore;

  const facets: SoupFacets = {
    has: (facetId, optionId) =>
      (state.facets[facetId] ?? []).includes(optionId),
    getSelected: (facetId) => state.facets[facetId] ?? [],
    toggle: (facetId, optionId) => {
      setStore(
        'facets',
        produce((selection) => {
          const active = selection[facetId] ?? [];
          selection[facetId] = active.includes(optionId)
            ? active.filter((id) => id !== optionId)
            : [...active, optionId];
        })
      );
    },
    set: (facetId, optionIds) => {
      setStore('facets', facetId, [...optionIds]);
    },
    hydrate: (selection) => {
      setStore('facets', reconcile({ ...selection }));
    },
    serialize: () => serializeFacets(state.facets),
    deserialize: deserializeFacets,
    compile: (ctx = {}) =>
      compileFacets(state.facets, activeFacetDefinitions(), ctx),
    test: (entity, ctx = {}) =>
      testFacets(state.facets, activeFacetDefinitions(), entity, ctx),
    setExtraFacets,
  };

  const groupByField = createMemo(() => resolveGroupByField(state.groupBy));

  const collapsedGroups: SoupCollapsedGroups = {
    isExpanded: (id) => !state.collapsedGroups.includes(id),
    toggle: (id) => {
      if (state.collapsedGroups.includes(id)) {
        setState('collapsedGroups', (ids) =>
          ids.filter((candidate) => candidate !== id)
        );
        return;
      }
      setState('collapsedGroups', (ids) => [...ids, id]);
    },
    expandAll: () => setState('collapsedGroups', []),
  };

  return {
    state,
    setState,
    facets,
    groupByField,
    collapsedGroups,
    reset: () => setStore(reconcile(getInitialStoreState())),
  };
}
