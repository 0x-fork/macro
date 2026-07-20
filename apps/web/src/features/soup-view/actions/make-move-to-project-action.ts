import { openBulkEditModal } from '@app/features/entity/bulk-edit/BulkEditEntityModal';
import { restoreSoupFocus } from '@app/features/next-soup/utils';
import { useMaybePreviewPanel } from '@components/app/PreviewPanel';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import {
  findAdjacentEntityItem,
  findEntityItem,
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

  const previewPanel = useMaybePreviewPanel();

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState
  ) => {
    const nextItem = findAdjacentEntityItem(
      list,
      new Set(entities.map((entity) => entity.id))
    );
    const inPreview = previewPanel !== undefined;

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
        restoreSoupFocus(nextItem?.entity.id, inPreview);
      },
      onCancel: () => {
        const firstEntity = entities[0];
        const firstItem = firstEntity
          ? findEntityItem(list, firstEntity.id)
          : undefined;
        if (firstItem) list.focus.set(firstItem.id);
        restoreSoupFocus(firstEntity?.id, inPreview);
      },
    });
  };

  return { canExecute, execute, executeWithList };
};
