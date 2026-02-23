import type { SidebarPinnedItem } from '@core/signal/layout/globalSidebar';
import type { EntityData, WithNotification } from '@entity';

export type SidebarItem =
  | {
      kind: 'view';
      pinnedItem: Extract<SidebarPinnedItem, { kind: 'view' }>;
    }
  | {
      kind: 'entity';
      pinned: boolean;
      entity: WithNotification<EntityData>;
    };

export type SidebarEntityItem = Extract<SidebarItem, { kind: 'entity' }>;

export function composeSidebarItems(params: {
  pinned: SidebarPinnedItem[];
  entities: WithNotification<EntityData>[];
}) {
  const { pinned, entities } = params;
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  const pinnedEntityIds = new Set<string>();
  const pinnedItems: SidebarItem[] = [];

  for (const pinnedItem of pinned) {
    if (pinnedItem.kind === 'view') {
      pinnedItems.push({ kind: 'view', pinnedItem });
      continue;
    }

    const entity = entityById.get(pinnedItem.entityId);
    if (!entity) continue;
    pinnedEntityIds.add(entity.id);
    pinnedItems.push({ kind: 'entity', pinned: true, entity });
  }

  const frecencyItems: SidebarEntityItem[] = entities
    .filter((entity) => !pinnedEntityIds.has(entity.id))
    .map((entity) => ({ kind: 'entity', pinned: false, entity }));

  return {
    pinnedItems,
    frecencyItems,
  };
}
