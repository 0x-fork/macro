import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { restoreSoupFocus } from '@app/features/next-soup/utils';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import type { SoupActionListState } from './list-action-state';

type MakeRenameOptions = {
  userId: () => string | undefined;
};

export const makeRenameAction = (options: MakeRenameOptions) => {
  const { userId } = options;

  const canExecute = (entity: EntityData): boolean => {
    if (entity.type === 'email') return false;
    if (entity.type === 'channel_message' || entity.type === 'channel_thread') {
      return false;
    }
    if (entity.type === 'foreign') return false;

    if (entity.type === 'channel') {
      if (entity.channelType === 'direct_message') return false;
      return entity.ownerId === userId();
    }

    return entity.ownerId === userId();
  };

  const execute = async (entities: EntityData[]) => {
    openBulkEditModal({
      view: 'rename',
      entities,
      onFinish: () => {
        toast.success(
          entities.length > 1 ? `Renamed ${entities.length} items` : 'Renamed'
        );
      },
    });
  };

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState
  ) => {
    const firstEntity = entities[0];
    const focusedItemId = list.focus.id();

    openBulkEditModal({
      view: 'rename',
      entities,
      onFinish: () => {
        toast.success(
          entities.length > 1 ? `Renamed ${entities.length} items` : 'Renamed'
        );
        if (focusedItemId && list.items.get(focusedItemId)) {
          list.focus.set(focusedItemId);
        }
        restoreSoupFocus(firstEntity?.id);
      },
      onCancel: () => {
        if (focusedItemId && list.items.get(focusedItemId)) {
          list.focus.set(focusedItemId);
        }
        restoreSoupFocus(firstEntity?.id);
      },
    });
  };

  return { canExecute, execute, executeWithList };
};
