import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import { createBulkCopyDssEntityMutation } from '@entity';
import type { SoupActionListState } from './list-action-state';

export const makeCopyAction = () => {
  const bulkCopyMutation = createBulkCopyDssEntityMutation();

  const canExecute = (entity: EntityData): boolean => {
    return (
      entity.type !== 'channel' &&
      entity.type !== 'email' &&
      entity.type !== 'channel_message' &&
      entity.type !== 'channel_thread' &&
      entity.type !== 'foreign'
    );
  };

  const execute = async (entities: EntityData[]) => {
    await bulkCopyMutation.mutateAsync({
      entities,
      name: (name) => name,
    });
    toast.success(
      entities.length > 1 ? `Copied ${entities.length} items` : 'Copied'
    );
  };

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState
  ) => {
    await execute(entities);
    list.selection.clear();
  };

  return { canExecute, execute, executeWithList };
};
