import type { EntityData } from '@entity';
import { optionFor } from './compile';
import type { Facet, FacetSelection } from './types';

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

export const deserializeFacets = (raw: unknown): FacetSelection => {
  if (!raw || typeof raw !== 'object') return {};

  const result: FacetSelection = {};
  for (const [facetId, optionIds] of Object.entries(raw)) {
    if (!Array.isArray(optionIds)) continue;

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

    const options = active.flatMap((id) => {
      const option = optionFor(facet, id, ctx);
      return option ? [option] : [];
    });
    if (!options.length) return true;

    const results = options.map((option) => option.predicate?.(entity, ctx));
    const testable = results.filter(
      (result): result is boolean => result !== undefined
    );
    if (!testable.length) return true;

    const mode =
      typeof facet.mode === 'function' ? facet.mode(ctx) : facet.mode;
    return mode === 'and'
      ? testable.every(Boolean)
      : testable.some(Boolean) ||
          results.some((result) => result === undefined);
  });
