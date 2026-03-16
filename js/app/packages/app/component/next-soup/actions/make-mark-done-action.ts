import { toast } from '@core/component/Toast/Toast';
import {
  type EntityData,
  isCurrentUserAssigned,
  isTaskClosed,
  isTaskEntity,
  type TaskEntityWithProperties,
} from '@entity';
import {
  markNotificationsForEntityAsDone,
  type NotificationSource,
} from '@notifications';
import { useSetPropertyStatusCompleteMutation } from '@queries/properties/entity';
import type { PropertiesEntityType } from '@service-properties/client';
import { storageServiceClient } from '@service-storage/client';
import { isOk } from '@core/util/maybeResult';
import { removeSoupReminders } from '@queries/soup/normalized-cache';
import type { SoupState } from '../create-soup-state';
import { archiveEmail } from '@app/component/next-soup/utils';

type MakeMarkDoneOptions = {
  userId: () => string | undefined;
  notificationSource: () => NotificationSource;
};

const getPropertiesEntityType = (
  entity: EntityData
): PropertiesEntityType | undefined => {
  if (isTaskEntity(entity)) return 'TASK';
  if (entity.type === 'email') return 'THREAD';
  if (entity.type === 'document') return 'DOCUMENT';
  if (entity.type === 'project') return 'PROJECT';
  return undefined;
};

export const makeMarkDoneAction = (options: MakeMarkDoneOptions) => {
  const { userId, notificationSource } = options;

  const setPropertyStatusCompleteMutation =
    useSetPropertyStatusCompleteMutation();

  const canExecute = (entity: EntityData): boolean => {
    // Reminders can always be marked done
    if (entity.reminderMetadata) {
      return true;
    }

    if (
      entity.type === 'email' ||
      entity.type === 'channel' ||
      entity.type === 'chat'
    ) {
      return true;
    }

    if (isTaskEntity(entity)) {
      const currentUserId = userId();
      if (
        !isCurrentUserAssigned(
          entity as TaskEntityWithProperties,
          currentUserId
        )
      ) {
        return false;
      }
      if (isTaskClosed(entity as TaskEntityWithProperties)) {
        return false;
      }
      return true;
    }

    if (entity.type === 'document' || entity.type === 'project') {
      return true;
    }

    return false;
  };

  const execute = async (entities: EntityData[]) => {
    const source = notificationSource();

    // Separate reminder entities from regular entities
    const reminderEntities = entities.filter((e) => e.reminderMetadata);
    const regularEntities = entities.filter((e) => !e.reminderMetadata);

    // Optimistically remove reminder items from the soup list
    const reminderIds = new Set(
      reminderEntities.map((e) => e.reminderMetadata!.reminderId)
    );
    const reminderTxn =
      reminderIds.size > 0 ? removeSoupReminders(reminderIds) : null;

    // Mark reminders as done via the reminders endpoint
    for (const entity of reminderEntities) {
      const result = await storageServiceClient.reminders.markDone({
        reminderId: entity.reminderMetadata!.reminderId,
      });
      if (!isOk(result)) {
        reminderTxn?.rollback();
        toast.error('Failed to dismiss reminder');
        return;
      }
    }

    // Handle regular entities with the existing logic
    for (const entity of regularEntities) {
      if (entity.type === 'email') {
        archiveEmail(entity.id, {
          archive: true,
          optimisticallyExclude: true,
        });
      }

      markNotificationsForEntityAsDone(source, entity);

      const entityType = getPropertiesEntityType(entity);
      if (entityType) {
        setPropertyStatusCompleteMutation.mutate({
          entityType,
          entityId: entity.id,
        });
      }
    }

    if (reminderEntities.length > 0 && regularEntities.length === 0) {
      toast.success(
        reminderEntities.length > 1
          ? `Dismissed ${reminderEntities.length} reminders`
          : 'Reminder dismissed'
      );
    } else {
      toast.success(
        entities.length > 1
          ? `Marked ${entities.length} items as done`
          : 'Marked as done'
      );
    }
  };

  const executeWithSoup = async (
    entities: EntityData[],
    soup: SoupState,
    onNavigate?: (entity: EntityData) => void
  ) => {
    const currentIndex = soup.focus.index();
    const nextEntity =
      soup.items.at(currentIndex + 1) ?? soup.items.at(currentIndex - 1);

    // Run collapse animation if conditions are met (touch modality + not-done filter active)
    if (soup.collapseEntity.shouldCollapse()) {
      const collapse = soup.collapseEntity.callback();
      if (collapse) {
        await Promise.all(entities.map((entity) => collapse(entity.id)));
      }
    }

    await execute(entities);

    soup.selection.clear();
    const shouldNavigate =
      soup.filters.isActive('signal') || soup.filters.isActive('noise');

    // marking email/reminder as done removes it from the view, so we should update selection.
    const willBeRemoved = entities.some(
      (e) => e.type === 'email' || e.reminderMetadata
    );

    if (nextEntity && (shouldNavigate || willBeRemoved)) {
      soup.focus.set(nextEntity.id);
      onNavigate?.(nextEntity);
    }
  };

  return { canExecute, execute, executeWithSoup };
};
