import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { and, type BackendAstMap, eq, not } from './clause';
import type { Facet } from './facets';
import {
  createFacetStore,
  deserializeFacets,
  serializeFacets,
} from './store';

const ME = 'user-me';

// documents-view type: a multi-select OR category spanning fileType / fileAssoc /
// subType, with compound options — the exact shape that ANDed (→ empty) in v5.
const DOC_TYPE: Facet = {
  id: 'doc-type',
  mode: 'or',
  options: [
    {
      id: 'markdown',
      clause: {
        df: and(eq('fileType', 'md'), not(eq('subType', 'snippet')), not(eq('subType', 'task'))),
      },
    },
    { id: 'canvas', clause: { df: eq('fileType', 'canvas') } },
    { id: 'code', clause: { df: eq('fileAssoc', 'assoc:code') } },
  ],
};

// owned/shared — opposite polarity on one field, across df+cf. mode:'or' makes
// "both selected → show all" fall out without any cancellation machinery.
const OWNERSHIP: Facet = {
  id: 'ownership',
  mode: 'or',
  options: [
    { id: 'owned', clause: { df: eq('documentOwnerId', ME), cf: eq('chatOwnerId', ME) } },
    {
      id: 'shared',
      clause: { df: not(eq('documentOwnerId', ME)), cf: not(eq('chatOwnerId', ME)) },
    },
  ],
};

// read/unread — closed boolean domain; mode:'or' subsumes domain-collapse.
const MAIL_STATUS: Facet = {
  id: 'mail-status',
  mode: 'or',
  options: [
    { id: 'read', clause: { ef: eq('emailSeen', true) } },
    { id: 'unread', clause: { ef: eq('emailSeen', false) } },
  ],
};

const FACETS = [DOC_TYPE, OWNERSHIP, MAIL_STATUS];

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
const rootOp = (ast: BackendAstMap['df']) => {
  const node = ast as Record<string, unknown> | undefined;
  if (!node) return 'none';
  if ('|' in node) return 'or';
  if ('&' in node) return 'and';
  if ('!' in node) return 'not';
  return 'lit';
};
const inc = (l: string): Signed => ({ neg: false, lit: l });
const exc = (l: string): Signed => ({ neg: true, lit: l });

describe('faceted filters', () => {
  it('an OR facet unions its options (same- or different-field) — the case v5 could not do', () => {
    withStore((s) => {
      s.toggle('doc-type', 'markdown'); // ft:md (compound)
      s.toggle('doc-type', 'canvas'); // ft:canvas (same field)
      s.toggle('doc-type', 'code'); // fa:assoc:code (different field)
      const lits = signedLits(s.compile().df);
      expect(rootOp(s.compile().df)).toBe('or');
      expect(lits).toContainEqual(inc('{"ft":"md"}'));
      expect(lits).toContainEqual(inc('{"ft":"canvas"}'));
      expect(lits).toContainEqual(inc('{"fa":"assoc:code"}'));
    });
  });

  it('OR-within-facet subsumes cancellation & domain-collapse (opposite polarity → show all)', () => {
    withStore((s) => {
      s.toggle('ownership', 'owned'); // owner = me  / NOT owner = me, across df+cf
      s.toggle('ownership', 'shared');
      s.toggle('mail-status', 'read'); // seen=true / seen=false, closed domain on ef
      s.toggle('mail-status', 'unread');

      const df = signedLits(s.compile().df);
      expect(df).toContainEqual(inc('{"o":"user-me"}'));
      expect(df).toContainEqual(exc('{"o":"user-me"}'));
      const cf = signedLits(s.compile().cf);
      expect(cf).toContainEqual(inc('{"o":"user-me"}'));
      expect(cf).toContainEqual(exc('{"o":"user-me"}'));
      const ef = signedLits(s.compile().ef);
      expect(ef).toContainEqual(inc('{"NotificationSeen":true}'));
      expect(ef).toContainEqual(inc('{"NotificationSeen":false}'));
    });
  });

  it('ANDs across facets within a target', () => {
    withStore((s) => {
      s.toggle('doc-type', 'canvas');
      s.toggle('ownership', 'owned');
      const df = s.compile().df;
      expect(rootOp(df)).toBe('and');
      const lits = signedLits(df);
      expect(lits).toContainEqual(inc('{"ft":"canvas"}'));
      expect(lits).toContainEqual(inc('{"o":"user-me"}'));
    });
  });

  it('keeps cross-target selections independent (df + ef)', () => {
    withStore((s) => {
      s.toggle('doc-type', 'canvas');
      s.toggle('mail-status', 'unread');
      const ast = s.compile();
      expect(signedLits(ast.df)).toEqual([inc('{"ft":"canvas"}')]);
      expect(signedLits(ast.ef)).toEqual([inc('{"NotificationSeen":false}')]);
    });
  });

  it('toggle / has / clear; unknown facet & option ids are inert', () => {
    withStore((s) => {
      s.toggle('doc-type', 'canvas');
      expect(s.has('doc-type', 'canvas')).toBe(true);
      s.toggle('doc-type', 'canvas');
      expect(s.has('doc-type', 'canvas')).toBe(false);

      s.toggle('bogus-facet', 'x'); // unknown facet
      s.toggle('doc-type', 'bogus-option'); // unknown option
      expect(s.compile()).toEqual({});
    });
  });

  it('deserialize drops unknown facets, keeps option ids verbatim (inert at compile)', () => {
    // option ids aren't validated on load — a stale id just resolves to no clause
    // at compile (an open-id-space facet can't enumerate anyway). Only whole
    // unknown facets are dropped.
    expect(
      deserializeFacets(
        { 'doc-type': ['canvas', 'gone'], 'gone-facet': ['x'] },
        FACETS
      )
    ).toEqual({ 'doc-type': ['canvas', 'gone'] });
  });

  it('round-trips selection through serialize → deserialize → compile', () => {
    let direct: BackendAstMap = {};
    let restored: BackendAstMap = {};

    withStore((s) => {
      s.toggle('doc-type', 'markdown');
      s.toggle('ownership', 'owned');
      direct = s.compile();
      expect(serializeFacets(s.selection)).toEqual({
        'doc-type': ['markdown'],
        ownership: ['owned'],
      });

      const blob = JSON.parse(JSON.stringify(serializeFacets(s.selection)));
      const loaded = deserializeFacets(blob, FACETS);
      s.clear();
      for (const [facetId, ids] of Object.entries(loaded)) s.set(facetId, ids);
      restored = s.compile();
    });

    expect(restored).toEqual(direct);
  });
});
