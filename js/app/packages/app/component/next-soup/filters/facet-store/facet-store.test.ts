import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { and, type BackendAstMap, eq, not } from './clause';
import { mergeAst } from './compile';
import { createFacetStore, deserializeFacets, serializeFacets } from './store';
import type { Facet } from './types';

// ── helpers ───────────────────────────────────────────────────────────────────

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

const rootOp = (ast: unknown) => {
  const node = ast as Record<string, unknown> | undefined;
  if (!node) return 'none';
  if ('|' in node) return 'or';
  if ('&' in node) return 'and';
  if ('!' in node) return 'not';
  return 'lit';
};

const inc = (l: string): Signed => ({ neg: false, lit: l });
const exc = (l: string): Signed => ({ neg: true, lit: l });
const NIL = '00000000-0000-0000-0000-000000000000';
const nil = (field: string) => ({ l: { [field]: NIL } });

// ── fixtures ──────────────────────────────────────────────────────────────────

type Ctx = { userId: string };

// multi-select OR category spanning fileType/fileAssoc/subType
const DOC_TYPE: Facet = {
  id: 'doc-type',
  mode: 'or',
  options: [
    {
      id: 'markdown',
      clause: {
        df: and(
          eq('fileType', 'md'),
          not(eq('subType', 'snippet')),
          not(eq('subType', 'task'))
        ),
      },
    },
    { id: 'canvas', clause: { df: eq('fileType', 'canvas') } },
    { id: 'code', clause: { df: eq('fileAssoc', 'assoc:code') } },
  ],
};

// static ownership for algebra tests
const OWNERSHIP_STATIC: Facet = {
  id: 'ownership',
  mode: 'or',
  options: [
    { id: 'owned', clause: { df: eq('documentOwnerId', 'user-me') } },
    { id: 'shared', clause: { df: not(eq('documentOwnerId', 'user-me')) } },
  ],
};

// ctx-relative ownership for the ctx tests
const OWNERSHIP_CTX: Facet<Ctx> = {
  id: 'ownership',
  mode: 'or',
  options: [
    {
      id: 'owned',
      clause: (_b, ctx) => ({ df: eq('documentOwnerId', ctx.userId) }),
    },
    {
      id: 'shared',
      clause: (_b, ctx) => ({ df: not(eq('documentOwnerId', ctx.userId)) }),
    },
  ],
};

const MAIL_STATUS: Facet = {
  id: 'mail-status',
  mode: 'or',
  options: [
    { id: 'read', clause: { ef: eq('emailSeen', true) } },
    { id: 'unread', clause: { ef: eq('emailSeen', false) } },
  ],
};

// restrict: inbox-style type chips — "is this type" via idField ≠ NIL
const INBOX_TYPE: Facet = {
  id: 'inbox-type',
  mode: 'or',
  restrict: true,
  options: [
    { id: 'docs', clause: { df: not(eq('documentId', NIL)) } },
    { id: 'mail', clause: { ef: not(eq('threadId', NIL)) } },
    { id: 'people', clause: { chanf: eq('channelType', 'direct_message') } },
  ],
};

// resolver: ids are entity ids; 'no-assignee' has no backend clause (client-only)
const ASSIGNEE: Facet = {
  id: 'assignee',
  mode: 'or',
  options: (optionId) =>
    optionId === 'no-assignee'
      ? { id: optionId }
      : {
          id: optionId,
          clause: {
            propf: eq('properties', {
              propertyId: 'system-assignees',
              type: 'entity' as const,
              value: optionId,
            }),
          },
        },
};

const STATUS_DEF = 'status-def';
const PRIORITY_DEF = 'priority-def';

const TASK_STATUS: Facet = {
  id: 'task-status',
  mode: 'or',
  options: [
    {
      id: 'not-started',
      clause: {
        propf: eq('properties', {
          propertyId: STATUS_DEF,
          type: 'select' as const,
          value: 'not-started',
        }),
      },
    },
    {
      id: 'in-progress',
      clause: {
        propf: eq('properties', {
          propertyId: STATUS_DEF,
          type: 'select' as const,
          value: 'in-progress',
        }),
      },
    },
  ],
};

const TASK_PRIORITY: Facet = {
  id: 'task-priority',
  mode: 'or',
  options: [
    {
      id: 'urgent',
      clause: {
        propf: eq('properties', {
          propertyId: PRIORITY_DEF,
          type: 'select' as const,
          value: 'urgent',
        }),
      },
    },
  ],
};

// ── compilation algebra ───────────────────────────────────────────────────────

describe('compilation algebra', () => {
  it('OR facet unions same- and different-field options', () => {
    createRoot((dispose) => {
      const s = createFacetStore([DOC_TYPE]);
      s.toggle('doc-type', 'markdown');
      s.toggle('doc-type', 'canvas');
      s.toggle('doc-type', 'code');
      expect(rootOp(s.compile().df)).toBe('or');
      const lits = signedLits(s.compile().df);
      expect(lits).toContainEqual(inc('{"ft":"md"}'));
      expect(lits).toContainEqual(inc('{"ft":"canvas"}'));
      expect(lits).toContainEqual(inc('{"fa":"assoc:code"}'));
      dispose();
    });
  });

  it('ANDs facets within a target; cross-target selections are independent', () => {
    createRoot((dispose) => {
      const s = createFacetStore([DOC_TYPE, OWNERSHIP_STATIC, MAIL_STATUS]);
      s.toggle('doc-type', 'canvas');
      s.toggle('ownership', 'owned');
      s.toggle('mail-status', 'unread');
      const ast = s.compile();
      // df: canvas AND owned
      expect(rootOp(ast.df)).toBe('and');
      expect(signedLits(ast.df)).toContainEqual(inc('{"ft":"canvas"}'));
      expect(signedLits(ast.df)).toContainEqual(inc('{"o":"user-me"}'));
      // ef independent: only mail-status
      expect(signedLits(ast.ef)).toEqual([inc('{"NotificationSeen":false}')]);
      dispose();
    });
  });

  it('OR-within-facet subsumes cancellation: both polarities selected → no collapse', () => {
    createRoot((dispose) => {
      const s = createFacetStore([OWNERSHIP_STATIC, MAIL_STATUS]);
      s.toggle('ownership', 'owned');
      s.toggle('ownership', 'shared');
      s.toggle('mail-status', 'read');
      s.toggle('mail-status', 'unread');
      const df = signedLits(s.compile().df);
      expect(df).toContainEqual(inc('{"o":"user-me"}'));
      expect(df).toContainEqual(exc('{"o":"user-me"}'));
      const ef = signedLits(s.compile().ef);
      expect(ef).toContainEqual(inc('{"NotificationSeen":true}'));
      expect(ef).toContainEqual(inc('{"NotificationSeen":false}'));
      dispose();
    });
  });

  it('exact compiled shape: (s1 | s2) & p1 across property facets', () => {
    createRoot((dispose) => {
      const s = createFacetStore([TASK_STATUS, TASK_PRIORITY]);
      s.toggle('task-status', 'not-started');
      s.toggle('task-status', 'in-progress');
      s.toggle('task-priority', 'urgent');
      expect(s.compile().propf).toEqual({
        '&': [
          {
            '|': [
              { l: { pd: STATUS_DEF, v: { so: 'in-progress' } } },
              { l: { pd: STATUS_DEF, v: { so: 'not-started' } } },
            ],
          },
          { l: { pd: PRIORITY_DEF, v: { so: 'urgent' } } },
        ],
      });
      dispose();
    });
  });
});

// ── restrict mode ─────────────────────────────────────────────────────────────

describe('restrict mode', () => {
  it('admitted types pass through; all other entity targets receive NIL', () => {
    createRoot((dispose) => {
      const s = createFacetStore([INBOX_TYPE]);
      s.toggle('inbox-type', 'docs');
      s.toggle('inbox-type', 'mail');
      const ast = s.compile();
      expect(ast.df).toEqual({ '!': nil('id') });
      expect(ast.ef).toEqual({ '!': nil('ThreadId') });
      expect(ast.cf).toEqual(nil('cid'));
      expect(ast.chanf).toEqual(nil('ChannelId'));
      expect(ast.pf).toEqual(nil('pid'));
      expect(ast.callf).toEqual(nil('CallId'));
      dispose();
    });
  });

  it('confinement overrides a clause on a disallowed target', () => {
    createRoot((dispose) => {
      const s = createFacetStore([INBOX_TYPE, OWNERSHIP_STATIC]);
      s.toggle('inbox-type', 'docs'); // restrict to df
      s.toggle('ownership', 'owned'); // adds to df (allowed) and would add to cf (not registered here)
      const ast = s.compile();
      expect(signedLits(ast.df)).toContainEqual(inc('{"o":"user-me"}'));
      expect(ast.ef).toEqual(nil('ThreadId'));
      dispose();
    });
  });
});

// ── resolver facets ───────────────────────────────────────────────────────────

describe('resolver facets', () => {
  it('dynamic entity ids OR within the facet; clause-less option emits nothing', () => {
    createRoot((dispose) => {
      const s = createFacetStore([ASSIGNEE]);
      s.toggle('assignee', 'no-assignee');
      expect(s.has('assignee', 'no-assignee')).toBe(true);
      expect(s.compile()).toEqual({});

      s.toggle('assignee', 'u1');
      s.toggle('assignee', 'u2');
      const lits = signedLits(s.compile().propf);
      expect(lits).toContainEqual(
        inc('{"pd":"system-assignees","v":{"er":"u1"}}')
      );
      expect(lits).toContainEqual(
        inc('{"pd":"system-assignees","v":{"er":"u2"}}')
      );
      dispose();
    });
  });
});

// ── ctx-relative values ───────────────────────────────────────────────────────

describe('ctx-relative values', () => {
  it('owner resolves from ctx at compile; selection stores intent only', () => {
    createRoot((dispose) => {
      const [userId, setUserId] = createSignal('alice');
      const s = createFacetStore([OWNERSHIP_CTX]);

      s.toggle('ownership', 'owned');
      expect(signedLits(s.compile({ userId: userId() }).df)).toEqual([
        inc('{"o":"alice"}'),
      ]);

      setUserId('bob');
      expect(signedLits(s.compile({ userId: userId() }).df)).toEqual([
        inc('{"o":"bob"}'),
      ]);

      expect(serializeFacets(s.selection)).toEqual({ ownership: ['owned'] });

      dispose();
    });
  });
});

// ── store lifecycle ───────────────────────────────────────────────────────────

describe('store lifecycle', () => {
  it('toggle / has / getSelected / clear / set; unknown ids are inert', () => {
    createRoot((dispose) => {
      const s = createFacetStore([DOC_TYPE]);

      s.toggle('doc-type', 'canvas');
      expect(s.has('doc-type', 'canvas')).toBe(true);
      expect(s.getSelected('doc-type')).toEqual(['canvas']);

      s.toggle('doc-type', 'canvas');
      expect(s.has('doc-type', 'canvas')).toBe(false);

      // unknown facet/option: accepted by store, inert at compile
      s.toggle('bogus-facet' as any, 'x' as any);
      s.toggle('doc-type', 'bogus-option' as any);
      expect(s.compile()).toEqual({});

      s.set('doc-type', ['canvas', 'markdown']);
      expect(s.getSelected('doc-type')).toEqual(['canvas', 'markdown']);

      s.clear('doc-type');
      expect(s.getSelected('doc-type')).toEqual([]);

      dispose();
    });
  });
});

// ── persistence ───────────────────────────────────────────────────────────────

describe('persistence', () => {
  const FACETS = [DOC_TYPE, OWNERSHIP_STATIC, MAIL_STATUS];

  it('deserialize drops unknown facets; keeps option ids verbatim (inert at compile)', () => {
    expect(
      deserializeFacets(
        { 'doc-type': ['canvas', 'gone'], 'gone-facet': ['x'] },
        FACETS
      )
    ).toEqual({ 'doc-type': ['canvas', 'gone'] });
  });

  it('round-trips through serialize → hydrate → compile', () => {
    let direct: BackendAstMap = {};
    let restored: BackendAstMap = {};

    createRoot((dispose) => {
      const s = createFacetStore(FACETS);
      s.toggle('doc-type', 'markdown');
      s.toggle('ownership', 'owned');
      direct = s.compile();

      const blob = JSON.parse(JSON.stringify(serializeFacets(s.selection)));
      const loaded = deserializeFacets(blob, FACETS);
      s.hydrate(loaded);
      restored = s.compile();
      dispose();
    });

    expect(restored).toEqual(direct);
  });
});

// ── presets / cross-tab persistence ──────────────────────────────────────────

describe('presets', () => {
  // a preset is a separate BackendAstMap ANDed in at compile — NOT stored in the facet store
  const baseline = (tab: string): BackendAstMap =>
    tab === 'signal'
      ? { df: { l: { nd: false } }, ef: { l: { Importance: true } } }
      : { df: { l: { nd: false } } };

  const TYPE_FACET: Facet = {
    id: 'type',
    mode: 'or',
    options: [{ id: 'canvas', clause: { df: eq('fileType', 'canvas') } }],
  };

  it('switching tabs swaps baseline only; user filters persist unchanged', () => {
    createRoot((dispose) => {
      const user = createFacetStore([TYPE_FACET]);
      user.toggle('type', 'canvas');

      const signal = mergeAst(baseline('signal'), user.compile());
      expect(signal.ef).toEqual({ l: { Importance: true } });

      const noise = mergeAst(baseline('noise'), user.compile());
      expect(noise.df).toEqual({
        '&': [{ l: { nd: false } }, { l: { ft: 'canvas' } }],
      });
      expect(noise.ef).toBeUndefined();
      expect(user.selection).toEqual({ type: ['canvas'] });

      dispose();
    });
  });
});
