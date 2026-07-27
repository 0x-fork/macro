import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { restoreSoupFocus } from '@app/features/soup/utils';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import {
  findAdjacentEntityItem,
  type SoupActionListState,
} from './list-action-state';

export const makeMoveToProjectAction = () => {
  const canExecute = (entity: EntityData): boolean => {
    return (
      entity.type !== 'channel' &&
      entity.type !== 'channel_message' &&
      entity.type !== 'channel_thread' &&
      entity.type !== 'foreign'
    );
  };

  const execute = async (entities: EntityData[]) => {
    openBulkEditModal({
      view: 'moveToProject',
      entities,
      onFinish: () => {
        toast.success(
          entities.length > 1
            ? `Moved ${entities.length} items`
            : 'Moved to folder'
        );
      },
    });
  };

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState
  ) => {
    const focusedItemId = list.focus.id();
    const focusedItem = focusedItemId
      ? list.items.get(focusedItemId)
      : undefined;
    const focusedEntityId =
      focusedItem?.kind === 'entity' ? focusedItem.entity.id : undefined;
    const nextItem = findAdjacentEntityItem(
      list,
      new Set(entities.map((entity) => entity.id))
    );

    openBulkEditModal({
      view: 'moveToProject',
      entities,
      onFinish: () => {
        list.selection.clear();
        if (nextItem) {
          list.focus.set(nextItem.id);
        }
        toast.success(
          entities.length > 1
            ? `Moved ${entities.length} items`
            : 'Moved to folder'
        );
        restoreSoupFocus(nextItem?.entity.id);
      },
      onCancel: () => {
        if (focusedItemId && list.items.get(focusedItemId)) {
          list.focus.set(focusedItemId);
        }
        restoreSoupFocus(focusedEntityId ?? entities[0]?.id);
      },
    });
  };

  return { canExecute, execute, executeWithList };
};
