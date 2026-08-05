import type {
  GroupMeta,
  SoupEntity,
  SoupRow,
} from '@app/features/next-soup/create-soup-state';
import { describe, expect, it } from 'vitest';
import { reconcileSoupRows } from './reconcile-soup-rows';

function entity(id: string, status: string): SoupEntity {
  return {
    id,
    type: 'document',
    name: `Task ${id}`,
    ownerId: 'owner',
    fileType: 'md',
    subType: { type: 'task' },
    properties: [
      {
        id: `property-${id}`,
        definition: { id: 'status' },
        value: { type: 'SelectOption', value: [status] },
      },
    ],
    notifications: () => [
      {
        id: `notification-${id}`,
        entityId: id,
      },
    ],
  } as unknown as SoupEntity;
}

function group(key: string, count: number): GroupMeta {
  return {
    key,
    value: key,
    label: key,
    count,
    isExpanded: () => true,
    toggle: () => {},
  };
}

function row(options: {
  id: string;
  index: number;
  original: SoupEntity;
  group?: GroupMeta;
  kind?: 'entity' | 'group-header' | 'load-more';
}): SoupRow {
  const kind = options.kind ?? 'entity';
  return {
    id: options.id,
    index: options.index,
    original: options.original,
    group: options.group,
    getIsGrouped: () => kind === 'group-header',
    getIsLoadMore: () => kind === 'load-more',
    isFocused: () => false,
    isSelected: () => false,
  };
}

function groupedRows(status = 'todo'): SoupRow[] {
  const groupMeta = group('todo', 2);
  const first = entity('first', status);
  const second = entity('second', 'todo');

  return [
    row({
      id: 'header:todo',
      index: 0,
      original: first,
      group: groupMeta,
      kind: 'group-header',
    }),
    row({ id: first.id, index: 1, original: first, group: groupMeta }),
    row({ id: second.id, index: 2, original: second, group: groupMeta }),
    row({
      id: 'loadmore:todo',
      index: 3,
      original: second,
      group: groupMeta,
      kind: 'load-more',
    }),
  ];
}

describe('reconcileSoupRows', () => {
  it('reuses unchanged entity and structural row references', () => {
    const previous = groupedRows();
    const rebuilt = groupedRows();

    const reconciled = reconcileSoupRows(previous, rebuilt);

    expect(reconciled).toHaveLength(previous.length);
    for (let index = 0; index < previous.length; index++) {
      expect(reconciled[index]).toBe(previous[index]);
      expect(reconciled[index]).not.toBe(rebuilt[index]);
    }
  });

  it('replaces only an entity whose rendered data changed', () => {
    const previous = groupedRows();
    const rebuilt = groupedRows('in-progress');

    const reconciled = reconcileSoupRows(previous, rebuilt);

    expect(reconciled[0]).not.toBe(previous[0]);
    expect(reconciled[1]).not.toBe(previous[1]);
    expect(reconciled[1].original).toMatchObject({
      properties: [
        {
          value: {
            type: 'SelectOption',
            value: ['in-progress'],
          },
        },
      ],
    });
    expect(reconciled[2]).toBe(previous[2]);
    expect(reconciled[3]).toBe(previous[3]);
  });

  it('replaces moved tasks and changed structural rows while reusing unaffected tasks', () => {
    const previousGroupA = group('a', 2);
    const previousGroupB = group('b', 1);
    const moved = entity('moved', 'a');
    const staysInA = entity('stays-a', 'a');
    const staysInB = entity('stays-b', 'b');
    const previous = [
      row({
        id: 'header:a',
        index: 0,
        original: moved,
        group: previousGroupA,
        kind: 'group-header',
      }),
      row({ id: moved.id, index: 1, original: moved, group: previousGroupA }),
      row({
        id: staysInA.id,
        index: 2,
        original: staysInA,
        group: previousGroupA,
      }),
      row({
        id: 'header:b',
        index: 3,
        original: staysInB,
        group: previousGroupB,
        kind: 'group-header',
      }),
      row({
        id: staysInB.id,
        index: 4,
        original: staysInB,
        group: previousGroupB,
      }),
      row({
        id: 'loadmore:b',
        index: 5,
        original: staysInB,
        group: previousGroupB,
        kind: 'load-more',
      }),
    ];

    const nextGroupA = group('a', 1);
    const nextGroupB = group('b', 2);
    const movedAfterUpdate = entity('moved', 'b');
    const rebuilt = [
      row({
        id: 'header:a',
        index: 0,
        original: staysInA,
        group: nextGroupA,
        kind: 'group-header',
      }),
      row({
        id: staysInA.id,
        index: 1,
        original: entity('stays-a', 'a'),
        group: nextGroupA,
      }),
      row({
        id: 'header:b',
        index: 2,
        original: movedAfterUpdate,
        group: nextGroupB,
        kind: 'group-header',
      }),
      row({
        id: movedAfterUpdate.id,
        index: 3,
        original: movedAfterUpdate,
        group: nextGroupB,
      }),
      row({
        id: staysInB.id,
        index: 4,
        original: entity('stays-b', 'b'),
        group: nextGroupB,
      }),
      row({
        id: 'loadmore:b',
        index: 5,
        original: entity('stays-b', 'b'),
        group: nextGroupB,
        kind: 'load-more',
      }),
    ];

    const reconciled = reconcileSoupRows(previous, rebuilt);

    expect(reconciled[0]).toBe(rebuilt[0]);
    expect(reconciled[0].group?.count).toBe(1);
    expect(reconciled[1]).toBe(previous[2]);
    expect(reconciled[1].index).toBe(1);
    expect(reconciled[2]).toBe(rebuilt[2]);
    expect(reconciled[2].group?.count).toBe(2);
    expect(reconciled[3]).toBe(rebuilt[3]);
    expect(reconciled[3]).not.toBe(previous[1]);
    expect(reconciled[4]).toBe(previous[4]);
    expect(reconciled[5]).toBe(rebuilt[5]);
  });
});
