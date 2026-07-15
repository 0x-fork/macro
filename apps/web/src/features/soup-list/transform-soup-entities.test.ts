import type { EntityData } from '@entity';
import { describe, expect, it, vi } from 'vitest';
import { buildGroupedSoupItems } from './build-soup-items';
import { createSoupEntityTransformer } from './transform-soup-entities';

type TestEntity = EntityData & {
  rank: number;
  visible: boolean;
  enriched?: boolean;
};

const entity = (id: string, rank: number, visible = true): TestEntity =>
  ({ id, rank, visible }) as TestEntity;

const deduplicate = (entities: TestEntity[]) => {
  const byId = new Map<string, TestEntity>();
  for (const item of entities) byId.set(item.id, item);
  return [...byId.values()];
};

describe('createSoupEntityTransformer', () => {
  it('enriches, filters, deduplicates, and sorts flat and grouped entities identically', () => {
    const enrich = vi.fn(
      (item: TestEntity): TestEntity => ({ ...item, enriched: true })
    );
    const transform = createSoupEntityTransformer<TestEntity, TestEntity>({
      enrich,
      include: (item) => item.visible,
      deduplicate,
      compare: (left, right) => left.rank - right.rank,
    });
    const raw = [
      entity('later', 3),
      entity('hidden', 0, false),
      entity('duplicate', 4),
      entity('duplicate', 1),
    ];

    const flat = transform(raw, { sort: true });
    const groups = [
      {
        id: 'first',
        label: 'First',
        count: raw.length,
        entities: raw,
      },
      {
        id: 'second',
        label: 'Second',
        count: 2,
        entities: [raw[1], raw[0]],
      },
    ].map((group) => ({
      ...group,
      entities: transform(group.entities, { sort: true }),
    }));
    const items = buildGroupedSoupItems(groups, () => true);

    expect(flat.map((item) => item.id)).toEqual(['duplicate', 'later']);
    expect(flat.every((item) => item.enriched)).toBe(true);
    expect(
      items
        .filter((item) => item.kind === 'entity')
        .map((item) => [item.groupId, item.entity.id])
    ).toEqual([
      ['first', 'duplicate'],
      ['first', 'later'],
      ['second', 'later'],
    ]);
    expect(enrich).toHaveBeenCalledTimes(raw.length * 2 + 2);
  });

  it('moves priority entities ahead without disturbing transformed remainder order', () => {
    const transform = createSoupEntityTransformer<TestEntity, TestEntity>({
      enrich: (item) => item,
      include: () => true,
      deduplicate,
      compare: (left, right) => left.rank - right.rank,
    });

    expect(
      transform([entity('a', 1), entity('b', 2), entity('c', 3)], {
        sort: true,
        priorityIds: ['c'],
      }).map((item) => item.id)
    ).toEqual(['c', 'a', 'b']);
  });
});

describe('buildGroupedSoupItems', () => {
  it('omits groups emptied by transformation and hides collapsed children', () => {
    const loadMore = vi.fn(async () => {});
    const items = buildGroupedSoupItems(
      [
        { id: 'empty', label: 'Empty', count: 4, entities: [] },
        {
          id: 'collapsed',
          label: 'Collapsed',
          count: 1,
          entities: [entity('a', 1)],
          loadMore,
        },
      ],
      () => false
    );

    expect(items).toEqual([
      {
        kind: 'group-header',
        id: 'group:collapsed',
        groupId: 'collapsed',
        label: 'Collapsed',
        count: 1,
      },
    ]);
  });
});
