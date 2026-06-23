import {
  AST,
  type BackendAstMap,
  type BackendAstNode,
  compileExpr,
  eq,
  isBackendAstNode,
  type TargetExpr,
} from './clause';
import {
  type Facet,
  type FacetSelection,
  type OptionClause,
  optionFor,
  resolveClause,
} from './facets';
import { TARGETS, type Target } from './targets';

const ENTITY_TARGETS = [
  'df',
  'ef',
  'chanf',
  'cthf',
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
  cthf: 'ChannelId',
  cf: 'cid',
  pf: 'pid',
  callf: 'CallId',
  fef: 'id',
  ccf: 'id',
};

const NIL = '00000000-0000-0000-0000-000000000000';

// The id field (facet field key) per entity target, used to NIL-fill.
const ID_FIELD: Record<EntityTarget, string> = {
  df: 'documentId',
  ef: 'threadId',
  chanf: 'channelId',
  cthf: 'channelThreadChannelId',
  cf: 'chatId',
  pf: 'folderId',
  callf: 'callId',
  fef: 'foreignEntityRecordId',
  ccf: 'crmCompanyId',
};

// Confine a clause to the entity types it references — NIL-fill every other
// entity target (id ≠ NIL ⇒ matches nothing). When confined clauses compose,
// the duplicate NIL-fills collapse to one per target during compile.
export const confine = (clause: OptionClause): OptionClause => {
  const out: OptionClause = { ...clause };
  for (const target of ENTITY_TARGETS) {
    if (!(target in out)) out[target] = eq(ID_FIELD[target], NIL);
  }
  return out;
};

const isEntityTarget = (target: Target): target is EntityTarget =>
  (ENTITY_TARGETS as readonly Target[]).includes(target);

// `confine` emits a bare `id = NIL` leaf at the top level of each excluded
// target (matches nothing). Recognize it so composed restricts collapse to one
// NIL-fill per target instead of carrying a duplicate per contributing clause.
// Verified against the legacy `defineQueryFilters`: NIL only ever appears as a
// top-level per-target leaf in an AND context, never nested or OR'd.
const isNilExpr = (expr: TargetExpr): boolean =>
  'field' in expr && (expr as { value: unknown }).value === NIL;

// per target: combine each facet's active options by mode, then AND the facets.
// `confine`d clauses exclude entity targets via a top-level NIL leaf; facets
// with `restrict` (multi-select type filters) confine via the engine instead.
export const compileFacets = <Ctx>(
  selection: FacetSelection,
  facets: readonly Facet<Ctx>[],
  ctx: Ctx
): BackendAstMap => {
  const byTarget = new Map<Target, BackendAstNode[]>();
  const allowed = new Set<EntityTarget>();
  const excluded = new Set<EntityTarget>();
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

        // A top-level NIL leaf excludes its entity target (AND with ⊥).
        if (isEntityTarget(target) && isNilExpr(expr)) {
          excluded.add(target);
          continue;
        }

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
    if (isEntityTarget(target) && excluded.has(target)) continue;

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

  // One NIL-fill per excluded target — deduped regardless of how many clauses
  // contributed it.
  for (const target of excluded) {
    result[target] = { l: { [ID_BACKEND[target]]: NIL } };
  }

  return result;
};

// AND two compiled maps per target (e.g. a preset baseline with the user's
// facet selection at the request boundary).
export const mergeAst = (a: BackendAstMap, b: BackendAstMap): BackendAstMap => {
  const out: BackendAstMap = { ...a };

  for (const target of Object.keys(b) as Target[]) {
    const incoming = b[target];
    if (!incoming) continue;

    const existing = out[target];
    out[target] = existing ? { '&': [existing, incoming] } : incoming;
  }

  return out;
};
