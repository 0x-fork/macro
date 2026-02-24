import type { SidebarPinnedItem } from '@core/signal/layout/globalSidebar';
import type { EntityData, WithNotification } from '@entity';
import { describe, expect, it } from 'vitest';
import { composeSidebarItems } from './compose-sidebar-items';

function makeEntity(id: string, name: string): WithNotification<EntityData> {
  return {
    id,
    name,
    ownerId: 'u1',
    type: 'document',
    fileType: 'md',
    createdAt: new Date(),
    updatedAt: new Date(),
    notifications: () => [],
  };
}

describe('composeSidebarItems', () => {
  it('keeps pinned order and floats pinned entities above frecency', () => {
    const entities = [
      makeEntity('a', 'A'),
      makeEntity('b', 'B'),
      makeEntity('c', 'C'),
    ];

    const pinned: SidebarPinnedItem[] = [
      { kind: 'view', id: 'inbox', label: 'Inbox' },
      {
        kind: 'entity',
        entityId: 'b',
        entityType: 'document',
        splitType: 'md',
      },
      { kind: 'view', id: 'sent', label: 'Sent' },
    ];

    const composed = composeSidebarItems({ pinned, entities });

    expect(composed.pinnedItems.map((item) => item.kind)).toEqual([
      'view',
      'entity',
      'view',
    ]);
    expect(
      composed.pinnedItems.find((item) => item.kind === 'entity' && item.entity.id === 'b')
    ).toBeTruthy();
  });

  it('deduplicates pinned entities from frecency list', () => {
    const entities = [
      makeEntity('a', 'A'),
      makeEntity('b', 'B'),
      makeEntity('c', 'C'),
    ];

    const pinned: SidebarPinnedItem[] = [
      {
        kind: 'entity',
        entityId: 'a',
        entityType: 'document',
        splitType: 'md',
      },
    ];

    const composed = composeSidebarItems({ pinned, entities });

    expect(composed.frecencyItems.map((item) => item.entity.id)).toEqual([
      'b',
      'c',
    ]);
  });

  it('ignores stale pinned entities that are not in the frecency payload', () => {
    const entities = [makeEntity('a', 'A')];
    const pinned: SidebarPinnedItem[] = [
      {
        kind: 'entity',
        entityId: 'missing',
        entityType: 'document',
        splitType: 'md',
      },
    ];

    const composed = composeSidebarItems({ pinned, entities });

    expect(composed.pinnedItems).toEqual([]);
    expect(composed.frecencyItems.map((item) => item.entity.id)).toEqual(['a']);
  });
});
