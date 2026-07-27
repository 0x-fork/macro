import { describe, expect, it } from 'vitest';
import {
  clearFacetRefinements,
  hasFacetRefinements,
} from '../facet-refinements';

type Collection = Parameters<typeof hasFacetRefinements>[0];

const collection = (initial: Record<string, string[]>) => {
  const selected = new Map(Object.entries(initial));
  return {
    facets: {
      getSelected: (id: string) => selected.get(id) ?? [],
      set: (id: string, ids: readonly string[]) => selected.set(id, [...ids]),
    },
  } as unknown as Collection;
};

describe('facet refinements', () => {
  it('detects refinements relative to a tab baseline', () => {
    const current = collection({ type: ['file-pdf'] });
    expect(hasFacetRefinements(current, {})).toBe(true);
    expect(hasFacetRefinements(current, { type: ['file-pdf'] })).toBe(false);
  });

  it('treats a narrowed task status set as a refinement', () => {
    expect(
      hasFacetRefinements(collection({ task_status: ['task-not-started'] }), {
        task_status: ['task-not-started'],
      })
    ).toBe(true);
    expect(
      hasFacetRefinements(
        collection({
          task_status: ['a', 'b', 'c', 'd', 'e'],
        }),
        {}
      )
    ).toBe(false);
  });

  it('clears user facets while preserving baseline values', () => {
    const current = collection({
      type: ['file-pdf'],
      tag: ['tag-1'],
      task_status: ['task-completed'],
    });
    clearFacetRefinements(current, { type: ['doc-markdown'] });

    expect(current.facets.getSelected('type')).toEqual(['doc-markdown']);
    expect(current.facets.getSelected('tag')).toEqual([]);
    expect(current.facets.getSelected('task_status')).toEqual([]);
  });
});
