import { TARGETS, type Target } from '../v5/targets';
import {
  AST,
  type BackendAstMap,
  type BackendAstNode,
  compileExpr,
  isBackendAstNode,
  type TargetExpr,
} from './clause';
import {
  type Facet,
  type FacetSelection,
  optionFor,
  resolveClause,
} from './facets';

// Entity targets a restrict facet can confine. propf is cross-cutting, never NIL'd.
const ENTITY_TARGETS = [
  'df',
  'ef',
  'chanf',
  'cf',
  'pf',
  'callf',
  'fef',
  'ccf',
] as const;

type EntityTarget = (typeof ENTITY_TARGETS)[number];

const ID_BACKEND: Record<EntityTarget, string> = {
  df: 'id',
  ef: 'ThreadId',
  chanf: 'ChannelId',
  cf: 'cid',
  pf: 'pid',
  callf: 'CallId',
  fef: 'id',
  ccf: 'id',
};

const NIL = '00000000-0000-0000-0000-000000000000';

const isEntityTarget = (target: Target): target is EntityTarget =>
  (ENTITY_TARGETS as readonly Target[]).includes(target);

// Compile: per target, combine each facet's active options by mode, then AND the
// facets. Restrict facets additionally confine which entity targets may appear.
export const compileFacets = <Ctx>(
  selection: FacetSelection,
  facets: readonly Facet<Ctx>[],
  ctx: Ctx
): BackendAstMap => {
  const byTarget = new Map<Target, BackendAstNode[]>();
  const allowed = new Set<EntityTarget>();
  let restricting = false;

  for (const facet of facets) {
    // dedupe + sort → canonical output, robust to repeated/persisted ids
    const activeIds = [...new Set(selection[facet.id] ?? [])].sort();

    if (!activeIds.length) continue;

    const clauses = activeIds.map((id) =>
      resolveClause(optionFor(facet, id, ctx)?.clause, ctx)
    );

    const exprsByTarget = new Map<Target, TargetExpr[]>();

    for (const clause of clauses) {
      for (const target of Object.keys(clause) as Target[]) {
        if (facet.restrict && isEntityTarget(target)) allowed.add(target);

        const expr = clause[target];
        if (!expr) continue;

        const list = exprsByTarget.get(target) ?? [];
        list.push(expr);
        exprsByTarget.set(target, list);
      }
    }

    if (facet.restrict) restricting = true;

    for (const [target, exprs] of exprsByTarget) {
      const combined: TargetExpr =
        facet.mode === 'or' ? { or: exprs } : { and: exprs };
      const ast = compileExpr(target, combined);

      if (!ast) continue;

      const list = byTarget.get(target) ?? [];
      list.push(ast);
      byTarget.set(target, list);
    }
  }

  const result: BackendAstMap = {};

  for (const target of TARGETS) {
    const asts = byTarget.get(target);
    if (!asts?.length) continue;

    const combined = AST.and(asts);
    if (isBackendAstNode(combined)) result[target] = combined;
  }

  if (restricting) {
    for (const target of ENTITY_TARGETS) {
      if (allowed.has(target)) continue;
      result[target] = { l: { [ID_BACKEND[target]]: NIL } };
    }
  }

  return result;
};
