import { copyBranchNameToClipboard } from '@core/util/branchName';
import { type EntityData, isTaskEntity } from '@entity';
import type { SoupActionListState } from './list-action-state';

export const makeCopyBranchNameAction = () => {
  const canExecute = (entity: EntityData): boolean => {
    return isTaskEntity(entity);
  };

  const execute = async (entities: EntityData[]) => {
    const entity = entities[0];
    if (!entity || !isTaskEntity(entity)) return;
    await copyBranchNameToClipboard(entity.id);
  };

  const executeWithList = async (
    entities: EntityData[],
    _list: SoupActionListState
  ) => {
    await execute(entities);
  };

  return { canExecute, execute, executeWithList };
};
