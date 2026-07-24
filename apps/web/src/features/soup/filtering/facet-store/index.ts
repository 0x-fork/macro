export type { BackendAstMap, Leaf, TargetExpr } from './clause';
export { and, clause, eq, not, or } from './clause';

export {
  compileClause,
  compileFacets,
  mergeAst,
  NIL as NIL_UUID,
} from './compile';
export {
  deserializeFacets,
  serializeFacets,
  testFacets,
} from './helpers';
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
