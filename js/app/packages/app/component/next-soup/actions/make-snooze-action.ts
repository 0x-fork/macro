import { openReminderPicker } from '@app/component/global-reminder-picker/GlobalReminderPicker';
import type { EntityData } from '@entity';
import type { SoupState } from '../create-soup-state';

type MakeSnoozeActionOptions = {
  markDone: {
    canExecute: (entity: EntityData) => boolean;
    execute: (entities: EntityData[]) => Promise<void>;
    executeWithSoup: (
      entities: EntityData[],
      soup: SoupState,
      onNavigate?: (entity: EntityData) => void
    ) => Promise<void>;
  };
};

export const makeSnoozeAction = (options: MakeSnoozeActionOptions) => {
  const { markDone } = options;

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

    openReminderPicker({
      entity,
      onReminderCreated: () => {
        markDone.execute(entities);
      },
    });
  };

  const executeWithSoup = (
    entities: EntityData[],
    soup: SoupState,
    onNavigate?: (entity: EntityData) => void
  ) => {
    const entity = entities[0];
    if (!entity) return;

    openReminderPicker({
      entity,
      onReminderCreated: () => {
        markDone.executeWithSoup(entities, soup, onNavigate);
      },
    });
  };

  return { canExecute, execute, executeWithSoup };
};
