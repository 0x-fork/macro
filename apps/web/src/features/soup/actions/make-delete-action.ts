import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { restoreSoupFocus, trashEmails } from '@app/features/next-soup/utils';
import { globalSplitManager } from '@app/signal/splitLayout';
import { globalRemoveFromSplitHistory } from '@components/app/split-layout/layoutUtils';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import ArrowCounterClockwise from '@phosphor-icons/core/regular/arrow-counter-clockwise.svg?component-solid';
import {
  findAdjacentEntityItem,
  type SoupActionListState,
} from './list-action-state';

type MakeDeleteOptions = {
  userId: () => string | undefined;
};

export const makeDeleteAction = (options: MakeDeleteOptions) => {
  const { userId } = options;

  const canExecute = (entity: EntityData): boolean => {
    if (entity.type === 'channel_message' || entity.type === 'channel_thread') {
      return false;
    }
    if (entity.type === 'email') {
      return true;
    }
    if (entity.type === 'channel') {
      return false;
    }
    return entity.ownerId === userId();
  };

  const execute = async (entities: EntityData[]) => {
    openBulkEditModal({
      view: 'delete',
      entities,
      onFinish: () => {
        const splitManager = globalSplitManager();
        if (splitManager) {
          const entityIdSet = new Set(entities.map(({ id }) => id));
          globalRemoveFromSplitHistory(splitManager, (entry) =>
            entityIdSet.has(entry.id)
          );
        }
        toast.success(
          entities.length > 1 ? `Deleted ${entities.length} items` : 'Deleted'
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

    const emailEntities = entities.filter((entity) => entity.type === 'email');
    const nonEmailEntities = entities.filter(
      (entity) => entity.type !== 'email'
    );

    const focusNext = () => {
      list.selection.clear();
      if (nextItem) list.focus.set(nextItem.id);
      restoreSoupFocus(nextItem?.entity.id);
    };

    const trashEmailEntities = () => {
      const handle = trashEmails(emailEntities.map((entity) => entity.id));

      const splitManager = globalSplitManager();
      if (splitManager) {
        const entityIdSet = new Set(emailEntities.map(({ id }) => id));
        globalRemoveFromSplitHistory(splitManager, (entry) =>
          entityIdSet.has(entry.id)
        );
      }

      focusNext();

      const toastId = toast.success(
        emailEntities.length > 1
          ? `Moved ${emailEntities.length} items to Trash`
          : 'Moved to Trash',
        {
          actions: [
            {
              label: 'Undo',
              icon: ArrowCounterClockwise,
              onClick: () => {
                if (toastId != null) toast.dismiss(toastId);
                handle.undo().then(
                  () => toast.success('Restored from Trash'),
                  () => toast.failure('Failed to restore from Trash')
                );
              },
            },
          ],
          duration: 10_000,
        }
      );

      handle.done.catch(() => {
        toast.failure('Failed to move to Trash');
      });
    };

    if (nonEmailEntities.length > 0) {
      openBulkEditModal({
        view: 'delete',
        entities: nonEmailEntities,
        onFinish: () => {
          const splitManager = globalSplitManager();
          if (splitManager) {
            const entityIdSet = new Set(nonEmailEntities.map(({ id }) => id));
            globalRemoveFromSplitHistory(splitManager, (entry) =>
              entityIdSet.has(entry.id)
            );
          }

          toast.success(
            nonEmailEntities.length > 1
              ? `Deleted ${nonEmailEntities.length} items`
              : 'Deleted'
          );

          if (emailEntities.length > 0) trashEmailEntities();
          else focusNext();
        },
        onCancel: () => {
          if (focusedItemId && list.items.get(focusedItemId)) {
            list.focus.set(focusedItemId);
          }
          restoreSoupFocus(focusedEntityId ?? nonEmailEntities[0]?.id);
        },
      });
    } else if (emailEntities.length > 0) {
      trashEmailEntities();
    }
  };

  return { canExecute, execute, executeWithList };
};
