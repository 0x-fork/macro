import {
  applyEntitiesNotDoneOptimistic,
  executeMarkEntitiesUndone,
  resolveMarkEntitiesDoneVariables,
} from '@app/features/soup/utils';
import { toast } from '@core/component/Toast/Toast';
import type { EntityData } from '@entity';
import type { NotificationSource } from '@notifications';
import { threadCanBeMarkedNotDone } from '@queries/email/thread';
import { fetchDoneNotificationIdsByEventItemIds } from '@queries/notification/user-notifications';
import { invalidateAllSoup, refetchSoupEntity } from '@queries/soup/cache';
import type { SoupActionListState } from './list-action-state';

type MakeMarkNotDoneOptions = {
  notificationSource: () => NotificationSource;
};

export const makeMarkNotDoneAction = (options: MakeMarkNotDoneOptions) => {
  const canExecute = (entity: EntityData): boolean =>
    entity.type === 'email' && entity.done === true;

  const execute = async (entities: EntityData[]) => {
    const candidates = entities.filter(canExecute);
    if (candidates.length === 0) return;

    const eligibility = await Promise.all(
      candidates.map((entity) => threadCanBeMarkedNotDone(entity.id))
    );
    const targets = candidates.filter((_, index) => eligibility[index]);

    if (targets.length === 0) {
      toast.alert(
        candidates.length > 1
          ? 'These threads have no received messages, so they stay done'
          : 'This thread has no received messages, so it stays done',
        { duration: 4_000 }
      );
      return;
    }

    const { emailIds, notificationIds } = resolveMarkEntitiesDoneVariables({
      entities: targets,
      notificationSource: options.notificationSource(),
    });
    const optimistic = applyEntitiesNotDoneOptimistic({
      emailIds,
      notificationIds,
    });

    try {
      const serverNotificationIds =
        await fetchDoneNotificationIdsByEventItemIds(emailIds);
      await executeMarkEntitiesUndone({
        emailIds,
        notificationIds: [
          ...new Set([...notificationIds, ...serverNotificationIds]),
        ],
      });
      toast.success(
        targets.length > 1
          ? `Marked ${targets.length} items as not done`
          : 'Marked as not done',
        { duration: 3_000, stack: true, hideOnMobile: true }
      );
      await Promise.all(
        emailIds.map((id) => refetchSoupEntity(id, 'emailThread'))
      );
      invalidateAllSoup();
    } catch (error) {
      optimistic.rollback();
      toast.failure('Failed to mark as not done');
      throw error;
    }
  };

  const executeWithList = async (
    entities: EntityData[],
    _list: SoupActionListState
  ) => {
    await execute(entities);
  };

  return { canExecute, execute, executeWithList };
};
