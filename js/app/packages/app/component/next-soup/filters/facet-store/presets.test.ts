import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import type { Target } from '../v5/targets';
import { type BackendAstMap, eq } from './clause';
import type { Facet } from './facets';
import { createFacetStore } from './store';

// A preset/tab is a SEPARATE compile input from the user's facet store. The two
// are merged (AND per target) only at compile. So tab-switching swaps the
// baseline while the user store is untouched → user filters persist for free.
const mergeAst = (a: BackendAstMap, b: BackendAstMap): BackendAstMap => {
  const out: BackendAstMap = { ...a };
  for (const key of Object.keys(b) as Target[]) {
    const incoming = b[key];
    if (!incoming) continue;
    const existing = out[key];
    out[key] = existing ? { '&': [existing, incoming] } : incoming;
  }
  return out;
};

// preset baselines — in real code `(ctx) => …` (userId + a 2-week window, etc.),
// resolved at compile so time/ctx-relative values never freeze.
const baseline = (tab: string): BackendAstMap =>
  tab === 'signal'
    ? { df: { l: { nd: false } }, ef: { l: { Importance: true } } }
    : { df: { l: { nd: false } } };

const DOC_TYPE: Facet = {
  id: 'type',
  mode: 'or',
  options: [{ id: 'canvas', clause: { df: eq('fileType', 'canvas') } }],
};

function withStore(fn: (s: ReturnType<typeof createFacetStore>) => void) {
  createRoot((dispose) => {
    fn(createFacetStore([DOC_TYPE]));
    dispose();
  });
}

describe('facet store + presets / cross-tab persistence', () => {
  it('switching tabs swaps only the baseline; user filters persist', () => {
    withStore((user) => {
      user.toggle('type', 'canvas');

      // signal tab
      const signal = mergeAst(baseline('signal'), user.compile());
      expect(signal.ef).toEqual({ l: { Importance: true } });

      // switch to noise — NOTHING done to the user store
      const noise = mergeAst(baseline('noise'), user.compile());

      // user refinement still applied on the new baseline
      expect(noise.df).toEqual({
        '&': [{ l: { nd: false } }, { l: { ft: 'canvas' } }],
      });
      // noise baseline has no ef constraint, and the user added none
      expect(noise.ef).toBeUndefined();

      // the selection never changed across the switch — no diff, no re-merge
      expect(user.selection).toEqual({ type: ['canvas'] });
    });
  });

  it('a per-facet reset is available when a tab should drop a refinement', () => {
    withStore((user) => {
      user.toggle('type', 'canvas');
      // a tab that wants a clean type scope clears just that facet
      user.clear('type');
      expect(mergeAst(baseline('noise'), user.compile()).df).toEqual({
        l: { nd: false },
      });
      expect(user.selection.type ?? []).toEqual([]);
    });
  });
});
