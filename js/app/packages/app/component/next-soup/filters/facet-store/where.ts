import { and, clause as builder, eq, not, or, type TargetExpr } from './clause';
import type { ClauseBuilder, OptionClause } from './facets';
import {
  FILTER_TARGETS,
  type FieldKey,
  type FieldsForTarget,
  type FilterTargets,
  TARGETS,
  type Target,
} from './targets';

// field key → owning target. Field keys are globally unique (each is prefixed
// by its entity), so the inversion is unambiguous.
const FIELD_TARGET: Record<string, Target> = {};
for (const target of TARGETS) {
  for (const field of Object.keys(FILTER_TARGETS[target])) {
    FIELD_TARGET[field] = target;
  }
}

// scalar ⇒ equals, array ⇒ "any of" (OR)
const leaf = (field: string, value: unknown): TargetExpr =>
  Array.isArray(value)
    ? or(...value.map((v) => eq(field, v)))
    : eq(field, value);

// `{ not: x }` negates. Date ranges (`{ gte }`) and properties have no `not`
// key, so they fall through to a bare leaf — compileLeaf reads their compile
// config. No other operators: arrays cover "in", `{ not: [...] }` covers "not in".
const exprFor = (field: string, value: unknown): TargetExpr =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  'not' in value
    ? not(leaf(field, (value as { not: unknown }).not))
    : leaf(field, value);

type Elem<V> = V extends readonly (infer E)[] ? E : V;
type Value<K extends FieldKey> = {
  [T in Target]: K extends FieldsForTarget<T> ? FilterTargets[T][K] : never;
}[Target];
type Input<K extends FieldKey> = Value<K> | Elem<Value<K>>;

export type WhereBag = Partial<{
  [K in FieldKey]: Input<K> | { not: Input<K> };
}> & {
  /**
   * Escape hatch for anything the bag can't express (cross-field OR, nesting).
   * Its clause is AND-merged into the bag per target; `ctx` comes from the
   * enclosing `defineClause` closure.
   */
  $clause?: (b: ClauseBuilder) => OptionClause;
};

// One declarative bag → an OptionClause: target inferred per field, fields on
// the same target AND together. Wrap with `defineClause(…, true)` to confine.
export const where = (spec: WhereBag): OptionClause => {
  const byTarget = new Map<Target, TargetExpr[]>();

  const push = (clause: OptionClause) => {
    for (const [target, expr] of Object.entries(clause) as [
      Target,
      TargetExpr | undefined,
    ][]) {
      if (!expr) continue;
      const list = byTarget.get(target) ?? [];
      list.push(expr);
      byTarget.set(target, list);
    }
  };

  for (const [field, value] of Object.entries(spec)) {
    if (field === '$clause' || value === undefined) continue;
    push({ [FIELD_TARGET[field]]: exprFor(field, value) });
  }

  if (spec.$clause) push(spec.$clause(builder));

  const out: OptionClause = {};
  for (const [target, exprs] of byTarget) {
    out[target] = exprs.length === 1 ? exprs[0] : and(...exprs);
  }
  return out;
};
