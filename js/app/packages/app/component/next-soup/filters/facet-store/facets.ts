import type { Target } from '../v5/targets';
import { and, eq, not, or, type TargetExpr } from './clause';

// The facet model: how a facet and its options are described and resolved.
// Turning a selection over these into a backend AST / client boolean lives in
// compile.ts.

// An option contributes a clause per target. A restrict facet admits the targets
// its options touch; "is this type" uses the exclude pattern (idField ≠ NIL).
export type OptionClause = Partial<Record<Target, TargetExpr>>;

// Builder injected into clause functions — author clauses without imports. Ctx
// is passed separately (second arg), so the builder itself is ctx-independent.
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
  clause?: ClauseDef<Ctx>; // backend (optional — predicate-only options allowed)
  predicate?: Predicate<Ctx>; // client (optional — server-only options allowed)
};

// `options` is a fixed catalog (array) or a resolver over an open id space
// (dynamic values — assignees, channel ids — survive persistence even when not
// currently listed).
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

// The wire/compile shape — loose, since persisted blobs carry plain strings.
export type FacetSelection = Record<string, string[]>;

// ── selection type-safety ────────────────────────────────────────────────────
// Ids/option-ids are recovered by inference from a `const`-preserved facet list
// (no type params on Facet). A list typed loosely as `Facet<Ctx>[]` widens these
// back to `string`, so the safety is opt-in and never a breaking constraint.

// Facet-id union of a facet list.
export type FacetId<F extends readonly Facet<any>[]> = F[number]['id'];

// Option-id type for one facet: a catalog (array) facet contributes the union of
// its literal option ids; a resolver facet has an open id space → `string`.
export type OptionIdOf<Fa> = Fa extends { options: readonly (infer O)[] }
  ? O extends { id: infer Id extends string }
    ? Id
    : string
  : string;

// Option-id type valid for facet `Id` within list `F`.
export type OptionIdFor<F extends readonly Facet<any>[], Id> = OptionIdOf<
  Extract<F[number], { id: Id }>
>;

// Typed read view of a selection over `F` (keys constrained; values stay string[]
// because hydrated/persisted ids are not validated against the catalog).
export type FacetSelectionOf<F extends readonly Facet<any>[]> = Partial<
  Record<FacetId<F>, string[]>
>;

// Resolve an option by id. An id with no match (catalog miss, or resolver
// returns undefined) yields `undefined` → its clause/predicate are absent → it
// contributes nothing. So unknown ids are inert; no validation pass is needed.
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

// Client-side test — same OR-within / AND-across structure. Options without a
// predicate are server-only; they never narrow the local result.
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
