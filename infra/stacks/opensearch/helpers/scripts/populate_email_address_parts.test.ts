import { describe, expect, test } from 'bun:test';
import {
  orderChunks,
  planChunks,
  type RewriteChunk,
} from './populate_email_address_parts';

const MONTH = (iso: string) => new Date(iso).getTime();

describe('planChunks', () => {
  test('no buckets → no chunks', () => {
    expect(planChunks([], 1000)).toEqual([]);
  });

  test('months under the cap collapse into one open-ended chunk', () => {
    const chunks = planChunks(
      [
        { key: MONTH('2026-01-01'), doc_count: 100 },
        { key: MONTH('2026-02-01'), doc_count: 200 },
      ],
      1000
    );
    expect(chunks).toEqual([
      {
        kind: 'range',
        from: MONTH('2026-01-01'),
        to: Number.MAX_SAFE_INTEGER,
        docs: 300,
      },
    ]);
  });

  test('chunks break before exceeding the cap and tile the timeline', () => {
    const chunks = planChunks(
      [
        { key: MONTH('2026-01-01'), doc_count: 600 },
        { key: MONTH('2026-02-01'), doc_count: 600 },
        { key: MONTH('2026-03-01'), doc_count: 100 },
      ],
      1000
    );
    expect(chunks).toEqual([
      {
        kind: 'range',
        from: MONTH('2026-01-01'),
        to: MONTH('2026-02-01'),
        docs: 600,
      },
      {
        kind: 'range',
        from: MONTH('2026-02-01'),
        to: Number.MAX_SAFE_INTEGER,
        docs: 700,
      },
    ]);
    // Ranges are half-open and adjacent, so no doc falls between two chunks.
    expect(chunks[0].kind === 'range' && chunks[0].to).toBe(
      chunks[1].kind === 'range' ? chunks[1].from : -1
    );
  });

  test('a single month heavier than the cap becomes its own chunk', () => {
    const chunks = planChunks(
      [
        { key: MONTH('2026-01-01'), doc_count: 5000 },
        { key: MONTH('2026-02-01'), doc_count: 10 },
      ],
      1000
    );
    expect(chunks.map((c) => c.docs)).toEqual([5000, 10]);
    expect(chunks[0]).toMatchObject({
      from: MONTH('2026-01-01'),
      to: MONTH('2026-02-01'),
    });
  });

  test('empty months are dropped rather than padding the plan', () => {
    const chunks = planChunks(
      [
        { key: MONTH('2026-01-01'), doc_count: 0 },
        { key: MONTH('2026-02-01'), doc_count: 50 },
      ],
      1000
    );
    expect(chunks).toEqual([
      {
        kind: 'range',
        from: MONTH('2026-02-01'),
        to: Number.MAX_SAFE_INTEGER,
        docs: 50,
      },
    ]);
  });

  test('the last chunk stays open-ended so mail arriving mid-run is covered', () => {
    const chunks = planChunks(
      [{ key: MONTH('2026-01-01'), doc_count: 10 }],
      1000
    );
    const last = chunks[chunks.length - 1];
    expect(last.kind === 'range' && last.to).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('orderChunks', () => {
  const RANGES: RewriteChunk[] = [
    {
      kind: 'range',
      from: MONTH('2024-01-01'),
      to: MONTH('2025-01-01'),
      docs: 1,
    },
    {
      kind: 'range',
      from: MONTH('2025-01-01'),
      to: MONTH('2026-01-01'),
      docs: 2,
    },
    {
      kind: 'range',
      from: MONTH('2026-01-01'),
      to: Number.MAX_SAFE_INTEGER,
      docs: 3,
    },
  ];

  test('newest-first reverses the ranges so recent mail regains recall first', () => {
    expect(orderChunks(RANGES, 'newest').map((c) => c.docs)).toEqual([3, 2, 1]);
  });

  test('oldest-first keeps chronological order', () => {
    expect(orderChunks(RANGES, 'oldest').map((c) => c.docs)).toEqual([1, 2, 3]);
  });

  test('undated docs go last in either order', () => {
    const withUndated: RewriteChunk[] = [
      ...RANGES,
      { kind: 'undated', docs: 56 },
    ];
    for (const order of ['newest', 'oldest'] as const) {
      const ordered = orderChunks(withUndated, order);
      expect(ordered[ordered.length - 1]).toEqual({
        kind: 'undated',
        docs: 56,
      });
      expect(ordered).toHaveLength(4);
    }
  });
});
