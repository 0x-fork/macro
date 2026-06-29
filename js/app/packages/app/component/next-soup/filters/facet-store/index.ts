export type { BackendAstMap, Leaf, TargetExpr } from './clause';
export { and, clause, eq, not, or } from './clause';

export { compileFacets, mergeAst, NIL as NIL_UUID } from './compile';
export {
  createFacetStore,
  deserializeFacets,
  serializeFacets,
  testFacets,
} from './store';
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
} from './types';
export { defineClause, type WhereBag } from './where';
