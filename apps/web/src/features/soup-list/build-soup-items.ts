import type { EntityData } from '@entity';
import type { Accessor } from 'solid-js';
import type { SoupEntityItem, SoupItem } from './types';

export type SoupItemGroup<TEntity extends EntityData = EntityData> = {
  id: string;
  label: string;
  entities: readonly TEntity[];
  count: number;
  loadMore?: () => Promise<unknown>;
  isLoading?: Accessor<boolean>;
};

export const buildSoupEntityItem = <TEntity extends EntityData>(
  entity: TEntity,
  groupId?: string
): SoupEntityItem<TEntity> => ({
  kind: 'entity',
  id: groupId ? `entity:${groupId}:${entity.id}` : `entity:${entity.id}`,
  entity,
  groupId,
});

export const buildFlatSoupItems = <TEntity extends EntityData>(
  entities: readonly TEntity[]
): SoupEntityItem<TEntity>[] =>
  entities.map((entity) => buildSoupEntityItem(entity));

/** Builds explicit group-header/entity/load-more items from transformed groups. */
export function buildGroupedSoupItems<TEntity extends EntityData>(
  groups: readonly SoupItemGroup<TEntity>[],
  isExpanded: (groupId: string) => boolean
): SoupItem[] {
  const items: SoupItem[] = [];

  for (const group of groups) {
    // Filtering can remove every entity from a backend group. Such a group has
    // no renderable header or pagination row in the final collection.
    if (group.entities.length === 0) continue;

    items.push({
      kind: 'group-header',
      id: `group:${group.id}`,
      groupId: group.id,
      label: group.label,
      count: group.count,
    });

    if (!isExpanded(group.id)) continue;

    items.push(
      ...group.entities.map((entity) => buildSoupEntityItem(entity, group.id))
    );

    if (group.loadMore) {
      items.push({
        kind: 'load-more',
        id: `load-more:${group.id}`,
        groupId: group.id,
        isLoading: group.isLoading,
        loadMore: group.loadMore,
      });
    }
  }

  return items;
}
