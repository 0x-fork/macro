import { createStore, produce, reconcile } from 'solid-js/store';
import { compileFacets } from './compile';
import type {
  Facet,
  FacetId,
  FacetSelection,
  FacetSelectionOf,
  OptionIdFor,
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

  const has = <Id extends FacetId<F>>(
    facetId: Id,
    optionId: OptionIdFor<F, Id>
  ) => (selection[facetId] ?? []).includes(optionId);

  // reactive; resolver facets return string[], catalog facets their union
  const getSelected = <Id extends FacetId<F>>(
    facetId: Id
  ): OptionIdFor<F, Id>[] => (selection[facetId] ?? []) as OptionIdFor<F, Id>[];

  // unknown ids are inert at compile, so no validation on write
  const toggle = <Id extends FacetId<F>>(
    facetId: Id,
    optionId: OptionIdFor<F, Id>
  ) => {
    setSelection(
      produce((draft) => {
        const active = draft[facetId] ?? [];
        draft[facetId] = active.includes(optionId)
          ? active.filter((id) => id !== optionId)
          : [...active, optionId];
      })
    );
  };

  const set = <Id extends FacetId<F>>(
    facetId: Id,
    optionIds: readonly OptionIdFor<F, Id>[]
  ) => {
    setSelection(facetId, [...optionIds]);
  };

  const clear = (facetId?: FacetId<F>) => {
    if (facetId) return setSelection(facetId, []);
    setSelection(reconcile({}));
  };

  const hydrate = (next: FacetSelection) =>
    setSelection(reconcile({ ...next }));

  const compile = () => compileFacets(selection, facets, getCtx());

  const test = (entity: unknown) =>
    testFacets(selection, facets, entity, getCtx());

  return {
    selection: selection as FacetSelectionOf<F>,
    has,
    getSelected,
    toggle,
    set,
    clear,
    hydrate,
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
