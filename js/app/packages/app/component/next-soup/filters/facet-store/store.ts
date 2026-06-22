import { createStore, produce, reconcile } from 'solid-js/store';
import { compileFacets, testFacets } from './compile';
import type {
  Facet,
  FacetId,
  FacetSelection,
  FacetSelectionOf,
  OptionIdFor,
} from './facets';

// The store IS the selection — facetId → active optionIds. No nodes, no derived
// keys. Identity is (facetId, optionId); persistence is this object verbatim.
// `getCtx` resolves ctx-relative option clauses (e.g. owner = ctx.userId) at
// compile time, so the persisted selection stays intent-only.
//
// `F` is captured as a `const` tuple so facet ids and (catalog) option ids are
// recovered as literal types: `toggle`/`has`/`set`/`clear` are keyed to the
// store's own facets. A list typed loosely as `Facet<Ctx>[]` widens these to
// `string` — the safety is opt-in, never a hard requirement.
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

  // Active option ids for a facet. Catalog facets narrow to their literal union;
  // resolver facets (assignees, channel ids) are `string[]`. Reactive — reads the
  // store, so it tracks inside a memo/JSX scope.
  const getSelected = <Id extends FacetId<F>>(
    facetId: Id
  ): OptionIdFor<F, Id>[] =>
    (selection[facetId] ?? []) as OptionIdFor<F, Id>[];

  // unknown ids are inert at compile (no matching option → no clause), so no
  // runtime validation is needed on write.
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

  // Bulk-load a (possibly persisted) selection. Bypasses per-key option typing:
  // deserialized ids are loose strings, already filtered to known facets by
  // `deserializeFacets`, and inert at compile if stale.
  const hydrate = (next: FacetSelection) => setSelection(reconcile({ ...next }));

  const compile = () => compileFacets(selection, facets, getCtx());

  // client-side predicate test (backend AST via compile, local filter via test)
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

// ── persistence ────────────────────────────────────────────────────────────
// The persisted form is the selection itself: { facetId: [optionId, …] }, sorted
// for a canonical blob. Robust to backend changes — only ids are stored, not
// literals. Deserialize drops unknown facets and keeps option ids verbatim
// (unknown ones are inert at compile); no version field.
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

    const valid = optionIds.filter((id): id is string => typeof id === 'string');
    if (valid.length) result[facetId] = valid;
  }

  return result;
};
