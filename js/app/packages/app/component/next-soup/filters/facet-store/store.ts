import { createStore, produce, reconcile } from 'solid-js/store';
import { compileFacets } from './compile';
import type {
  Facet,
  FacetKey,
  FacetSelection,
  FacetSelectionOf,
} from './facets';
import { testFacets } from './facets';

export const createFacetStore = <
  Ctx = unknown,
  const F extends readonly Facet<Ctx>[] = readonly Facet<Ctx>[],
>(
  facets: F,
  getCtx: () => Ctx = () => ({}) as Ctx
) => {
  const [selection, setSelection] = createStore<FacetSelection>({});

  // facet ids are a closed catalog (typed); option ids are an open space
  // (resolver facets), so they stay string. unknown ids are inert at compile.
  const has = (facetId: FacetKey<F>, optionId: string) =>
    (selection[facetId] ?? []).includes(optionId);

  const getSelected = (facetId: FacetKey<F>): string[] =>
    selection[facetId] ?? [];

  const toggle = (facetId: FacetKey<F>, optionId: string) => {
    setSelection(
      produce((draft) => {
        const active = draft[facetId] ?? [];
        draft[facetId] = active.includes(optionId)
          ? active.filter((id) => id !== optionId)
          : [...active, optionId];
      })
    );
  };

  const set = (facetId: FacetKey<F>, optionIds: readonly string[]) => {
    setSelection(facetId, [...optionIds]);
  };

  const clear = (facetId?: FacetKey<F>) => {
    if (facetId) return setSelection(facetId, []);
    setSelection(reconcile({}));
  };

  const hydrate = (next: FacetSelection) =>
    setSelection(reconcile({ ...next }));

  const compile = () => compileFacets(selection, facets, getCtx());

  const test = (entity: unknown) =>
    testFacets(selection, facets, entity, getCtx());

  // canonical blob for entry-state persistence; restore via `hydrate`
  const serialize = () => serializeFacets(selection);

  return {
    selection: selection as FacetSelectionOf<F>,
    has,
    getSelected,
    toggle,
    set,
    clear,
    hydrate,
    serialize,
    compile,
    test,
  };
};

export const serializeFacets = (selection: FacetSelection): FacetSelection => {
  const result: FacetSelection = {};

  for (const facetId of Object.keys(selection).sort()) {
    const active = selection[facetId];
    if (active?.length) result[facetId] = [...active].sort();
  }

  return result;
};

export const deserializeFacets = <Ctx>(
  raw: unknown,
  facets: readonly Facet<Ctx>[]
): FacetSelection => {
  if (!raw || typeof raw !== 'object') return {};

  const ids = new Set(facets.map((facet) => facet.id));
  const result: FacetSelection = {};

  for (const [facetId, optionIds] of Object.entries(raw)) {
    if (!ids.has(facetId) || !Array.isArray(optionIds)) continue;

    const valid = optionIds.filter(
      (id): id is string => typeof id === 'string'
    );
    if (valid.length) result[facetId] = valid;
  }

  return result;
};
