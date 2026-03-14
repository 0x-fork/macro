import { openReminderPicker } from '@app/component/global-reminder-picker/GlobalReminderPicker';
import type { EntityData } from '@entity';
import type { SoupState } from '../create-soup-state';

export const makeRemindAction = () => {
  const canExecute = (entity: EntityData): boolean => {
    return (
      entity.type === 'document' ||
      entity.type === 'email' ||
      entity.type === 'chat' ||
      entity.type === 'channel' ||
      entity.type === 'project'
    );
  };

  const execute = (entities: EntityData[]) => {
    const entity = entities[0];
    if (!entity) return;

    openReminderPicker({ entity });
  };

  const executeWithSoup = (entities: EntityData[], _soup: SoupState) => {
    execute(entities);
  };

  return { canExecute, execute, executeWithSoup };
};
