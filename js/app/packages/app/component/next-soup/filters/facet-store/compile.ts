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

// per target: combine each facet's active options by mode, then AND the facets.
// restrict facets also confine which entity targets may appear.
export const compileFacets = <Ctx>(
  selection: FacetSelection,
  facets: readonly Facet<Ctx>[],
  ctx: Ctx
): BackendAstMap => {
  const byTarget = new Map<Target, BackendAstNode[]>();
  const allowed = new Set<EntityTarget>();
  let restricting = false;

  for (const facet of facets) {
    // dedupe + sort for canonical output
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

// AND two compiled maps per target (e.g. a preset baseline with the user's
// facet selection at the request boundary).
export const mergeAst = (
  a: BackendAstMap,
  b: BackendAstMap
): BackendAstMap => {
  const out: BackendAstMap = { ...a };

  for (const target of Object.keys(b) as Target[]) {
    const incoming = b[target];
    if (!incoming) continue;

    const existing = out[target];
    out[target] = existing ? { '&': [existing, incoming] } : incoming;
  }

  return out;
};
