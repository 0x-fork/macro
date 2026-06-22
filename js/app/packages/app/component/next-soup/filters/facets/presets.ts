// Cross-cutting preset facets: seeded by tab presets, predicate-only (the backend
// baseline lives in the preset query). Reuse the existing predicate functions.
import { sharedEntity } from '../predicates';
import { facet } from './base';

export const OWNERSHIP = facet({
  id: 'ownership',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'owned-entity',
      predicate: (e, ctx) => !sharedEntity(() => ctx.userId)(e),
    },
    {
      id: 'shared-entity',
      predicate: (e, ctx) => sharedEntity(() => ctx.userId)(e),
    },
  ],
});
