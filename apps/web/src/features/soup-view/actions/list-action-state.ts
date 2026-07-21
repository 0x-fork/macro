import type { ListState } from '@app/components/list';
import type { SoupEntityRow, SoupRow } from '@app/features/soup-list';

/** List capabilities needed by replacement Soup entity actions. */
export type SoupActionListState = ListState<SoupRow>;

export const findEntityItem = (
  list: SoupActionListState,
  entityId: string
): SoupEntityRow | undefined =>
  list.items
    .all()
    .find(
      (item): item is SoupEntityRow =>
        item.kind === 'entity' && item.entity.id === entityId
    );

/** Finds the nearest entity that will remain after the action completes. */
export function findAdjacentEntityItem(
  list: SoupActionListState,
  excludedEntityIds: ReadonlySet<string>
): SoupEntityRow | undefined {
  const items = list.items.all();
  const focusedIndex = list.focus.index();

  const find = (direction: 1 | -1) => {
    for (
      let index = focusedIndex + direction;
      index >= 0 && index < items.length;
      index += direction
    ) {
      const item = items[index];
      if (
        item?.kind === 'entity' &&
        list.selection.isSelectable(item) &&
        !excludedEntityIds.has(item.entity.id)
      ) {
        return item;
      }
    }
  };

  return find(1) ?? find(-1);
}
