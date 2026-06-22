import { createRoot, createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { type BackendAstMap, eq, not } from './clause';
import type { Facet } from './facets';
import { createFacetStore, serializeFacets } from './store';

type Ctx = { userId: string };

const ASSIGNEES_PROP = 'system-assignees';
const NO_ASSIGNEE = 'no-assignee';

// resolver options: ids are entity ids; NO_ASSIGNEE is known but contributes no
// backend clause (client-only "unassigned").
const ASSIGNEE: Facet<Ctx> = {
  id: 'assignee',
  mode: 'or',
  options: (optionId) =>
    optionId === NO_ASSIGNEE
      ? { id: optionId }
      : {
          id: optionId,
          clause: {
            propf: eq('properties', {
              propertyId: ASSIGNEES_PROP,
              type: 'entity',
              value: optionId,
            }),
          },
        },
};

const NIL = '00000000-0000-0000-0000-000000000000';

// restrict: inbox-style type chips. "is this type" via the exclude pattern.
const INBOX_TYPE: Facet<Ctx> = {
  id: 'inbox-type',
  mode: 'or',
  restrict: true,
  options: [
    { id: 'docs', clause: { df: not(eq('documentId', NIL)) } },
    { id: 'mail', clause: { ef: not(eq('threadId', NIL)) } },
    { id: 'people', clause: { chanf: eq('channelType', 'direct_message') } },
  ],
};

// ctx-relative: owner resolves from ctx (2nd clause arg) at compile; selection
// stores 'owned'.
const OWNERSHIP: Facet<Ctx> = {
  id: 'ownership',
  mode: 'or',
  options: [
    { id: 'owned', clause: (_b, ctx) => ({ df: eq('documentOwnerId', ctx.userId) }) },
    { id: 'shared', clause: (_b, ctx) => ({ df: not(eq('documentOwnerId', ctx.userId)) }) },
  ],
};

const FACETS: Facet<Ctx>[] = [ASSIGNEE, INBOX_TYPE, OWNERSHIP];

function withStore(
  getCtx: () => Ctx,
  fn: (s: ReturnType<typeof createFacetStore<Ctx>>) => void
) {
  createRoot((dispose) => {
    fn(createFacetStore(FACETS, getCtx));
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
const inc = (l: string): Signed => ({ neg: false, lit: l });

const ME = () => ({ userId: 'user-me' });

describe('parametric facets', () => {
  it('dynamic entity ids OR within the facet', () => {
    withStore(ME, (s) => {
      s.toggle('assignee', 'u1');
      s.toggle('assignee', 'u2');
      const lits = signedLits(s.compile().propf);
      expect(lits).toContainEqual(
        inc('{"pd":"system-assignees","v":{"er":"u1"}}')
      );
      expect(lits).toContainEqual(
        inc('{"pd":"system-assignees","v":{"er":"u2"}}')
      );
    });
  });

  it('a clause-less option (NO_ASSIGNEE) is selectable but emits no backend clause', () => {
    withStore(ME, (s) => {
      // alone → no query at all
      s.toggle('assignee', NO_ASSIGNEE);
      expect(s.has('assignee', NO_ASSIGNEE)).toBe(true);
      expect(s.compile()).toEqual({});

      // alongside a real id → only the real id reaches the backend
      s.toggle('assignee', 'u1');
      expect(signedLits(s.compile().propf)).toEqual([
        inc('{"pd":"system-assignees","v":{"er":"u1"}}'),
      ]);
    });
  });
});

describe('restrict mode (target confinement)', () => {
  const nil = (backendIdField: string) => ({
    l: { [backendIdField]: '00000000-0000-0000-0000-000000000000' },
  });

  it('Docs + Mail → admit df/ef, NIL the other entity targets', () => {
    withStore(ME, (s) => {
      s.toggle('inbox-type', 'docs');
      s.toggle('inbox-type', 'mail');
      const ast = s.compile();
      // df/ef admitted via the is-type exclude pattern
      expect(ast.df).toEqual({ '!': nil('id') });
      expect(ast.ef).toEqual({ '!': nil('ThreadId') });
      // everything else excluded
      expect(ast.cf).toEqual(nil('cid'));
      expect(ast.chanf).toEqual(nil('ChannelId'));
      expect(ast.pf).toEqual(nil('pid'));
      expect(ast.callf).toEqual(nil('CallId'));
      expect(ast.fef).toEqual(nil('id'));
      expect(ast.ccf).toEqual(nil('id'));
    });
  });

  it('People only → admit chanf (with its constraint), NIL the rest', () => {
    withStore(ME, (s) => {
      s.toggle('inbox-type', 'people');
      const ast = s.compile();
      expect(ast.chanf).toEqual({ l: { ChannelType: 'direct_message' } });
      expect(ast.df).toEqual(nil('id'));
      expect(ast.ef).toEqual(nil('ThreadId'));
    });
  });

  it('confinement overrides a clause on a disallowed target', () => {
    withStore(ME, (s) => {
      s.toggle('inbox-type', 'docs'); // restrict to df
      s.toggle('ownership', 'owned'); // contributes to df — allowed, kept
      const ast = s.compile();
      // df keeps both the is-doc exclude and the ownership refinement
      expect(signedLits(ast.df)).toContainEqual(inc('{"o":"user-me"}'));
      // ef etc. still NIL'd despite no other clause
      expect(ast.ef).toEqual(nil('ThreadId'));
    });
  });
});

describe('ctx-relative values', () => {
  it('owner resolves from ctx at compile; selection stays intent-only', () => {
    createRoot((dispose) => {
      const [userId, setUserId] = createSignal('alice');
      const store = createFacetStore(FACETS, () => ({ userId: userId() }));

      store.toggle('ownership', 'owned');
      expect(signedLits(store.compile().df)).toEqual([inc('{"o":"alice"}')]);

      // same selection, different ctx → recompiles fresh
      setUserId('bob');
      expect(signedLits(store.compile().df)).toEqual([inc('{"o":"bob"}')]);

      // persisted form carries the id, never the resolved user
      expect(serializeFacets(store.selection)).toEqual({ ownership: ['owned'] });

      dispose();
    });
  });
});
