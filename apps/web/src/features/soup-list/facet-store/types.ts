import type { EntityData } from '@entity';
import type { TargetExpr } from './clause';
import type { Target } from './targets';

export type OptionClause = Partial<Record<Target, TargetExpr>>;

export type ClauseBuilder = {
  eq: (field: string, value: unknown) => TargetExpr;
  not: (expr: TargetExpr) => TargetExpr;
  and: (...exprs: TargetExpr[]) => TargetExpr;
  or: (...exprs: TargetExpr[]) => TargetExpr;
};

export type ClauseDef<Ctx> =
  | OptionClause
  | ((b: ClauseBuilder, ctx: Ctx) => OptionClause);

export type Predicate<Ctx> = (entity: EntityData, ctx: Ctx) => boolean;

export type FacetOption<Ctx> = {
  id: string;
  clause?: ClauseDef<Ctx>; // backend
  predicate?: Predicate<Ctx>; // client
};

export type OptionResolver<Ctx> = (
  optionId: string,
  ctx: Ctx
) => FacetOption<Ctx> | undefined;

export type FacetMode<Ctx> = 'or' | 'and' | ((ctx: Ctx) => 'or' | 'and');

export type Facet<Ctx = unknown> = {
  id: string;
  mode: FacetMode<Ctx>;
  multiple?: boolean;
  restrict?: boolean;
  options: readonly FacetOption<Ctx>[] | OptionResolver<Ctx>;
};

export type FacetSelection = Record<string, string[]>;

export type FacetId<F extends readonly Facet<any>[]> = F[number]['id'];

// known facet ids autocomplete; arbitrary strings (resolver/dynamic) still allowed
export type FacetKey<F extends readonly Facet<any>[]> =
  | FacetId<F>
  | (string & {});

export type OptionIdOf<Fa> = Fa extends { options: readonly (infer O)[] }
  ? O extends { id: infer Id extends string }
    ? Id
    : string
  : string;

export type OptionIdFor<F extends readonly Facet<any>[], Id> = OptionIdOf<
  Extract<F[number], { id: Id }>
>;

export type FacetSelectionOf<F extends readonly Facet<any>[]> = Partial<
  Record<FacetId<F>, string[]>
>;
