import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { type BackendAstMap, eq } from './clause';
import type { Facet } from './facets';
import { createFacetStore } from './store';

const STATUS = 'status-def';
const PRIORITY = 'priority-def';
const ASSIGNEES = 'assignees-def';

const sel = (pd: string, value: string) =>
  eq('properties', { propertyId: pd, type: 'select' as const, value });
const ent = (pd: string, value: string) =>
  eq('properties', { propertyId: pd, type: 'entity' as const, value });

// each property id is its own facet → OR within, AND across (facets AND)
const TASK_STATUS: Facet = {
  id: 'task-status',
  mode: 'or',
  options: [
    { id: 'not-started', clause: { propf: sel(STATUS, 'not-started') } },
    { id: 'in-progress', clause: { propf: sel(STATUS, 'in-progress') } },
    { id: 'done', clause: { propf: sel(STATUS, 'done') } },
  ],
};

const TASK_PRIORITY: Facet = {
  id: 'task-priority',
  mode: 'or',
  options: [
    { id: 'urgent', clause: { propf: sel(PRIORITY, 'urgent') } },
    { id: 'high', clause: { propf: sel(PRIORITY, 'high') } },
  ],
};

const ASSIGNEE: Facet = {
  id: 'assignee',
  mode: 'or',
  options: (id) => ({ id, clause: { propf: ent(ASSIGNEES, id) } }),
};

const FACETS: Facet[] = [TASK_STATUS, TASK_PRIORITY, ASSIGNEE];

function withStore(fn: (s: ReturnType<typeof createFacetStore>) => void) {
  createRoot((dispose) => {
    fn(createFacetStore(FACETS));
    dispose();
  });
}

type Signed = { neg: boolean; lit: string };
function signedLits(ast: unknown, neg = false, out: Signed[] = []): Signed[] {
  const node = ast as Record<string, any> | undefined;
  if (!node) return out;
  if ('l' in node) out.push({ neg, lit: JSON.stringify(node.l) });
  else if ('!' in node) signedLits(node['!'], !neg, out);
  else if ('&' in node) {
    signedLits(node['&'][0], neg, out);
    signedLits(node['&'][1], neg, out);
  } else if ('|' in node) {
    signedLits(node['|'][0], neg, out);
    signedLits(node['|'][1], neg, out);
  }
  return out;
}
const rootOp = (ast: BackendAstMap['propf']) => {
  const node = ast as Record<string, unknown> | undefined;
  if (!node) return 'none';
  if ('|' in node) return 'or';
  if ('&' in node) return 'and';
  if ('!' in node) return 'not';
  return 'lit';
};
const inc = (l: string): Signed => ({ neg: false, lit: l });

describe('property facets (OR within a property, AND across properties)', () => {
  it('a parametric assignee property ANDs in alongside select properties', () => {
    withStore((s) => {
      s.toggle('task-status', 'done');
      s.toggle('assignee', 'u1');
      const lits = signedLits(s.compile().propf);
      expect(lits).toContainEqual(inc('{"pd":"status-def","v":{"so":"done"}}'));
      expect(lits).toContainEqual(inc('{"pd":"assignees-def","v":{"er":"u1"}}'));
      expect(rootOp(s.compile().propf)).toBe('and');
    });
  });

  it('the exact compiled shape: (s1 | s2) & p1', () => {
    withStore((s) => {
      s.toggle('task-status', 'not-started');
      s.toggle('task-status', 'in-progress');
      s.toggle('task-priority', 'urgent');
      expect(s.compile().propf).toEqual({
        '&': [
          {
            '|': [
              { l: { pd: 'status-def', v: { so: 'in-progress' } } },
              { l: { pd: 'status-def', v: { so: 'not-started' } } },
            ],
          },
          { l: { pd: 'priority-def', v: { so: 'urgent' } } },
        ],
      });
    });
  });
});
