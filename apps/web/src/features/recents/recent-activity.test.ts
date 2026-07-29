import type { EntityData } from '@entity';
import { describe, expect, it } from 'vitest';
import { bucketRecentActivity, entityActivityAt } from './recent-activity';

const NOW = new Date('2026-07-29T15:00:00Z');

let nextId = 0;
function makeDoc(timestamps: {
  viewedAt?: string;
  updatedAt?: string;
  createdAt?: string;
}): EntityData {
  nextId += 1;
  return {
    type: 'document',
    id: `doc-${nextId}`,
    name: `Doc ${nextId}`,
    ownerId: 'user-1',
    ...timestamps,
  };
}

describe('entityActivityAt', () => {
  it('returns the latest of viewedAt/updatedAt/createdAt', () => {
    const entity = makeDoc({
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-29T10:00:00Z',
      viewedAt: '2026-07-20T00:00:00Z',
    });
    expect(entityActivityAt(entity)).toEqual(new Date('2026-07-29T10:00:00Z'));
  });

  it('falls back to createdAt and tolerates missing timestamps', () => {
    expect(
      entityActivityAt(makeDoc({ createdAt: '2026-07-28T00:00:00Z' }))
    ).toEqual(new Date('2026-07-28T00:00:00Z'));
    expect(entityActivityAt(makeDoc({}))).toBeUndefined();
  });
});

describe('bucketRecentActivity', () => {
  it('buckets by calendar day relative to now', () => {
    const today = makeDoc({ viewedAt: '2026-07-29T08:00:00Z' });
    const yesterday = makeDoc({ updatedAt: '2026-07-28T23:00:00Z' });
    const thisWeek = makeDoc({ updatedAt: '2026-07-24T12:00:00Z' });
    const thisMonth = makeDoc({ viewedAt: '2026-07-05T12:00:00Z' });
    const ancient = makeDoc({ updatedAt: '2026-05-01T12:00:00Z' });

    const buckets = bucketRecentActivity(
      [ancient, thisMonth, thisWeek, yesterday, today],
      NOW
    );

    expect(
      buckets.map((bucket) => [
        bucket.label,
        bucket.entities.map((entity) => entity.id),
      ])
    ).toEqual([
      ['Today', [today.id]],
      ['Yesterday', [yesterday.id]],
      ['Previous 7 Days', [thisWeek.id]],
      ['Previous 30 Days', [thisMonth.id]],
    ]);
  });

  it('omits empty buckets and drops undated entities', () => {
    const today = makeDoc({ viewedAt: '2026-07-29T08:00:00Z' });
    const undated = makeDoc({});

    const buckets = bucketRecentActivity([undated, today], NOW);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe('today');
    expect(buckets[0].entities).toEqual([today]);
  });

  it('orders entities newest-first within a bucket', () => {
    const older = makeDoc({ viewedAt: '2026-07-29T01:00:00Z' });
    const newer = makeDoc({ updatedAt: '2026-07-29T14:00:00Z' });

    const buckets = bucketRecentActivity([older, newer], NOW);

    expect(buckets[0].entities.map((entity) => entity.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('counts future timestamps as today', () => {
    const future = makeDoc({ updatedAt: '2026-07-30T02:00:00Z' });

    const buckets = bucketRecentActivity([future], NOW);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].key).toBe('today');
  });
});
