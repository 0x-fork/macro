import type { Target } from '../v5/targets';
import { and, eq, not, or, type TargetExpr } from './clause';

// per-option, per-target clause; restrict facets admit a type via idField ≠ NIL
export type OptionClause = Partial<Record<Target, TargetExpr>>;

export type ClauseBuilder = {
  eq: (field: string, value: unknown) => TargetExpr;
  not: (expr: TargetExpr) => TargetExpr;
  and: (...exprs: TargetExpr[]) => TargetExpr;
  or: (...exprs: TargetExpr[]) => TargetExpr;
};

const builder: ClauseBuilder = { eq, not, and, or };

export type ClauseDef<Ctx> =
  | OptionClause
  | ((b: ClauseBuilder, ctx: Ctx) => OptionClause);

export type Predicate<Ctx> = (entity: any, ctx: Ctx) => boolean;

export type FacetOption<Ctx> = {
  id: string;
  clause?: ClauseDef<Ctx>; // backend
  predicate?: Predicate<Ctx>; // client
};

export type OptionResolver<Ctx> = (
  optionId: string,
  ctx: Ctx
) => FacetOption<Ctx> | undefined;

export type Facet<Ctx = unknown> = {
  id: string;
  mode: 'or' | 'and';
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

// no match (catalog miss / resolver undefined) → inert: no clause, no predicate
export const optionFor = <Ctx>(
  facet: Facet<Ctx>,
  optionId: string,
  ctx: Ctx
): FacetOption<Ctx> | undefined =>
  typeof facet.options === 'function'
    ? facet.options(optionId, ctx)
    : facet.options.find((o) => o.id === optionId);

export const resolveClause = <Ctx>(
  def: ClauseDef<Ctx> | undefined,
  ctx: Ctx
): OptionClause =>
  def == null ? {} : typeof def === 'function' ? def(builder, ctx) : def;

export const testFacets = <Ctx>(
  selection: FacetSelection,
  facets: readonly Facet<Ctx>[],
  entity: unknown,
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

    return facet.mode === 'and'
      ? testable.every(Boolean)
      : testable.some(Boolean) || results.some((r) => r === undefined);
  });
