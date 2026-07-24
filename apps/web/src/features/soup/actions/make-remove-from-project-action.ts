import { restoreSoupFocus } from '@app/features/next-soup/utils';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import { createBulkRemoveFromProjectDssEntityMutation } from '@entity';
import {
  findAdjacentEntityItem,
  type SoupActionListState,
} from './list-action-state';

/** Clear the entities' folder (set their project to none). */
export const makeRemoveFromProjectAction = () => {
  const removeMutation = createBulkRemoveFromProjectDssEntityMutation();

  const canExecute = (entity: EntityData): boolean =>
    entity.type === 'document' ||
    entity.type === 'chat' ||
    entity.type === 'project' ||
    entity.type === 'email';

  const execute = async (entities: EntityData[]): Promise<boolean> => {
    // Failure toast is shown by the mutation
    const result = await removeMutation
      .mutateAsync({ entities })
      .catch(() => null);
    if (!result) return false;
    toast.success(
      entities.length > 1
        ? `Removed ${entities.length} items from folder`
        : 'Removed from folder'
    );
    return true;
  };

  const executeWithList = async (
    entities: EntityData[],
    list: SoupActionListState
  ) => {
    // Entities leave the viewed folder's list; move focus to a neighbor
    const nextItem = findAdjacentEntityItem(
      list,
      new Set(entities.map((entity) => entity.id))
    );

    const success = await execute(entities);
    // Rolled back on failure; keep selection and focus for a retry
    if (!success) return;

    list.selection.clear();
    if (nextItem) {
      list.focus.set(nextItem.id);
    }
    restoreSoupFocus(nextItem?.entity.id);
  };

  return { canExecute, execute, executeWithList };
};
