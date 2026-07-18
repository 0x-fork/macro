import type { EntityData } from '@entity';
import { createSignal } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { compileFacets, optionFor } from './compile';
import type {
  Facet,
  FacetKey,
  FacetSelection,
  FacetSelectionOf,
} from './types';

export const createFacetStore = <
  Ctx = unknown,
  const F extends readonly Facet<Ctx>[] = readonly Facet<Ctx>[],
>(
  facets: F,
  options: {
    initialSelection?: FacetSelection;
    initialExtraFacets?: readonly Facet<Ctx>[];
    beforeChange?: () => void;
  } = {}
) => {
  const [selection, setSelection] = createStore<FacetSelection>({
    ...options.initialSelection,
  });

  // Externally registered facets that are not provided in the `facets` arg
  const [extraFacets, setExtraFacets] = createSignal<readonly Facet<Ctx>[]>(
    options.initialExtraFacets ?? []
  );

  const activeFacets = (): readonly Facet<Ctx>[] => [
    ...(facets as readonly Facet<Ctx>[]),
    ...extraFacets(),
  ];

  // Option ids can be dynamic and unknown. Ids for the facets passed in `facets`
  // arg can be inferred
  const has = (facetId: FacetKey<F>, optionId: string) =>
    (selection[facetId] ?? []).includes(optionId);

  const getSelected = (facetId: FacetKey<F>): string[] =>
    selection[facetId] ?? [];

  const toggle = (facetId: FacetKey<F>, optionId: string) => {
    options.beforeChange?.();
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
    options.beforeChange?.();
    setSelection(facetId, [...optionIds]);
  };

  const clear = (facetId?: FacetKey<F>) => {
    options.beforeChange?.();
    if (facetId) return setSelection(facetId, []);
    setSelection(reconcile({}));
  };

  const hydrate = (next: FacetSelection) => {
    options.beforeChange?.();
    setSelection(reconcile({ ...next }));
  };

  const compile = (ctx: Ctx = {} as Ctx) =>
    compileFacets(selection, activeFacets(), ctx);

  const test = (entity: EntityData, ctx: Ctx = {} as Ctx) =>
    testFacets(selection, activeFacets(), entity, ctx);

  const serialize = () => serializeFacets(selection);
  const deserialize = (raw: unknown) => deserializeFacets(raw, activeFacets());

  return {
    selection: selection as FacetSelectionOf<F>,
    has,
    getSelected,
    toggle,
    set,
    clear,
    hydrate,
    serialize,
    deserialize,
    compile,
    test,
    setExtraFacets: (next: readonly Facet<Ctx>[]) => {
      options.beforeChange?.();
      setExtraFacets(next);
    },
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

export const testFacets = <Ctx>(
  selection: FacetSelection,
  facets: readonly Facet<Ctx>[],
  entity: EntityData,
  ctx: Ctx
): boolean =>
  facets.every((facet) => {
    const active = selection[facet.id] ?? [];
    if (!active.length) return true;

    const results = active.map((id) =>
      optionFor(facet, id, ctx)?.predicate?.(entity, ctx)
    );
    const testable = results.filter((r): r is boolean => r !== undefined);
    if (!testable.length) return true;

    const mode =
      typeof facet.mode === 'function' ? facet.mode(ctx) : facet.mode;
    return mode === 'and'
      ? testable.every(Boolean)
      : testable.some(Boolean) || results.some((r) => r === undefined);
  });
