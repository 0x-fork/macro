/**
 * Contract tests against the COMMITTED wasm artifact (pkg/). These run the
 * real binary through the real wrapper, so a stale or broken artifact —
 * e.g. Rust filter semantics changed without `just build_soup_filter_wasm`
 * being re-run — fails CI here instead of silently shipping.
 */
import { describe, expect, it } from 'vitest';
import { compileSoupAst, compileSoupFilters } from '../src/index';

const DOC_ID = '0e2c2a8a-3f6e-4f3b-9a44-1f3b9b1f3b9b';
const OTHER_ID = '93cf3aa6-58a8-4f6e-b51e-3e6c9d3e3a01';
const USER = 'macro|user@example.com';
const ASSIGNEES_ID = '00000001-0000-0000-0000-000000000001';

function doc(id: string, extra: Record<string, unknown> = {}) {
  return {
    tag: 'document',
    data: {
      id,
      ownerId: USER,
      name: 'd',
      documentVersionId: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      properties: [],
      ...extra,
    },
    frecency_score: 0,
  };
}

describe('soup-filter-wasm contract (committed artifact)', () => {
  it('compiles typed filters and matches by id', async () => {
    const filter = await compileSoupFilters({
      document_filters: { document_ids: [DOC_ID] },
    });
    expect(filter.matches(doc(DOC_ID))).toBe('match');
    expect(filter.matches(doc(OTHER_ID))).toBe('noMatch');
    filter.dispose();
  });

  it('compiles the exact AST wire shape compile.ts produces', async () => {
    // `&`/`|`/`!` combinators with `l` literal nodes and short field tags.
    const filter = await compileSoupAst({
      df: {
        '|': [{ l: { id: DOC_ID } }, { l: { id: OTHER_ID } }],
      },
      cf: { '!': { l: { cid: DOC_ID } } },
    });
    expect(filter.matches(doc(DOC_ID))).toBe('match');
    expect(filter.matches({ tag: 'chat', data: { id: DOC_ID } })).toBe(
      'noMatch'
    );
    filter.dispose();
  });

  it('rejects malformed ASTs with a thrown error (drift detector)', async () => {
    await expect(compileSoupAst({ df: { bogus: 1 } })).rejects.toThrow();
    await expect(
      compileSoupFilters({ document_filters: { document_ids: ['not-a-uuid'] } })
    ).rejects.toThrow();
  });

  it('round-trips typed filters through the canonical AST', async () => {
    const typed = await compileSoupFilters({
      document_filters: { document_ids: [DOC_ID] },
    });
    const fromAst = await compileSoupAst(JSON.parse(typed.astJson()));
    expect(fromAst.matches(doc(DOC_ID))).toBe('match');
    typed.dispose();
    fromAst.dispose();
  });

  it('returns unknown for locally undecidable filters, decidable via state', async () => {
    const filter = await compileSoupFilters({
      document_filters: { notification_filters: { done: false } },
    });
    expect(filter.matches(doc(DOC_ID))).toBe('unknown');
    expect(filter.matches(doc(DOC_ID), { hasUndoneNotification: true })).toBe(
      'match'
    );
    expect(filter.matches(doc(DOC_ID), { hasUndoneNotification: false })).toBe(
      'noMatch'
    );
    filter.dispose();
  });

  it('decides task importance with requester options', async () => {
    const filter = await compileSoupFilters(
      { document_filters: { importance: true } },
      { currentUserId: USER, assigneesPropertyId: ASSIGNEES_ID }
    );
    const assignedTask = doc(DOC_ID, {
      subType: { type: 'task', is_completed: false },
      properties: [
        {
          definition: { id: ASSIGNEES_ID },
          value: {
            type: 'EntityReference',
            value: [{ entity_id: USER }],
          },
        },
      ],
    });
    const unassignedTask = doc(OTHER_ID, {
      subType: { type: 'task', is_completed: false },
    });
    expect(filter.matches(assignedTask)).toBe('match');
    expect(filter.matches(unassignedTask)).toBe('noMatch');
    filter.dispose();
  });

  it('evaluates batches with per-item states', async () => {
    const filter = await compileSoupFilters({
      chat_filters: { importance: false },
    });
    const chat = { tag: 'chat', data: { id: DOC_ID } };
    const verdicts = filter.matchesMany([chat, doc(DOC_ID)]);
    expect(verdicts).toEqual(['noMatch', 'match']);
    filter.dispose();
  });

  it('degrades to unknown for entity tags this build does not know', async () => {
    const filter = await compileSoupFilters({
      document_filters: { document_ids: [DOC_ID] },
    });
    expect(filter.matches({ tag: 'hologram', data: {} })).toBe('unknown');
    filter.dispose();
  });
});
