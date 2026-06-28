import { createSignal } from 'solid-js';
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
  facets: F
) => {
  const [selection, setSelection] = createStore<FacetSelection>({});

  // Extra facets supplied by the consumer (e.g. a preset's inline baseline
  // facets) that aren't in the static catalog. They participate in compile/test
  // alongside the catalog; the store stays unaware of where they come from.
  const [extraFacets, setExtraFacets] = createSignal<readonly Facet<Ctx>[]>([]);

  const activeFacets = (): readonly Facet<Ctx>[] => [
    ...(facets as readonly Facet<Ctx>[]),
    ...extraFacets(),
  ];

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

  // ctx is supplied at call time (consumed by ctx-relative clauses/predicates)
  const compile = (ctx: Ctx = {} as Ctx) =>
    compileFacets(selection, activeFacets(), ctx);

  const test = (entity: unknown, ctx: Ctx = {} as Ctx) =>
    testFacets(selection, activeFacets(), entity, ctx);

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
    setExtraFacets,
  };
};

export const serializeFacets = (
  selection: Partial<FacetSelection>
): FacetSelection => {
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
