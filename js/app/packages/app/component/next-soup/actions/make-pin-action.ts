import {
  canPinEntity,
  isPinned,
  pinEntity,
  unpinEntity,
} from '@app/signal/pins';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import type { SoupState } from '../create-soup-state';

export const makePinAction = () => {
  const canExecute = (entity: EntityData): boolean => canPinEntity(entity);

  /** Whether every (pinnable) entity in the selection is already pinned. */
  const allPinned = (entities: EntityData[]): boolean => {
    const pinnable = entities.filter(canPinEntity);
    return (
      pinnable.length > 0 && pinnable.every((entity) => isPinned(entity.id))
    );
  };

  const execute = async (entities: EntityData[]) => {
    const pinnable = entities.filter(canPinEntity);
    if (pinnable.length === 0) return;

    if (allPinned(pinnable)) {
      for (const entity of pinnable) unpinEntity(entity.id);
      toast.success(pinnable.length > 1 ? 'Unpinned items' : 'Unpinned');
    } else {
      for (const entity of pinnable) pinEntity(entity);
      toast.success(pinnable.length > 1 ? 'Pinned items' : 'Pinned');
    }
  };

  const executeWithSoup = async (entities: EntityData[], _soup: SoupState) => {
    await execute(entities);
  };

  return { canExecute, allPinned, execute, executeWithSoup };
};
