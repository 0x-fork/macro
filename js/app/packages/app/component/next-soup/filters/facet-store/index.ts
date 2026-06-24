export type { BackendAstMap, Leaf, TargetExpr } from './clause';
export { and, clause, eq, not, or } from './clause';

export { compileFacets, mergeAst, NIL as NIL_UUID } from './compile';
export type {
  ClauseBuilder,
  ClauseDef,
  Facet,
  FacetId,
  FacetKey,
  FacetOption,
  FacetSelection,
  FacetSelectionOf,
  OptionClause,
  OptionIdFor,
  OptionIdOf,
  OptionResolver,
  Predicate,
} from './facets';
export { testFacets } from './facets';
export {
  createFacetStore,
  deserializeFacets,
  serializeFacets,
} from './store';
export { defineClause, type WhereBag } from './where';
