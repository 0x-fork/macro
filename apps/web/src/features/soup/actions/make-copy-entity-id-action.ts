import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import type { SoupActionListState } from './list-action-state';

export const makeCopyEntityIdAction = () => {
  const canExecute = (_entity: EntityData): boolean => {
    return true;
  };

  const execute = async (entities: EntityData[]) => {
    const entity = entities[0];
    if (!entity) return;

    await navigator.clipboard.writeText(entity.id);
    toast.success('ID copied to clipboard');
  };

  const executeWithList = async (
    entities: EntityData[],
    _list: SoupActionListState
  ) => {
    await execute(entities);
  };

  return { canExecute, execute, executeWithList };
};
