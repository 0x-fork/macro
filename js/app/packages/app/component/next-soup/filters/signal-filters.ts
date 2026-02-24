import {
  isCurrentUserAssigned,
  isTaskClosed,
  isTaskEntity,
  type TaskEntityWithProperties,
  type EntityData,
} from '@entity';
import { useUserId } from '@core/context/user';

/**
 * determines if a task should appear in the signal tab.
 * tasks appear in signal if:
 * - they are not completed or canceled
 * - the current user is an assignee (or the task has no assignees)
 */
export const isSignalTask = (
  entity: TaskEntityWithProperties,
  currentUserId: string | undefined
): boolean => {
  if (isTaskClosed(entity)) {
    return false;
  }
  return isCurrentUserAssigned(entity, currentUserId);
};

const getCurrentUserId = () => {
  try {
    return useUserId()();
  } catch {
    return undefined;
  }
};

/**
 * Signal filter - important/prioritized items.
 *
 * Classification:
 * - Channels: Always signal (explicit membership)
 * - Chats: Always signal
 * - Documents: Docs always signal, tasks depending on conditions
 * - Emails: Always signal (filtering handled by backend)
 * - Projects: Always signal
 */
export function signalFilter(entity: EntityData): boolean {
  switch (entity.type) {
    case 'channel':
      return true;
    case 'chat':
      return true;
    case 'document': {
      if (isTaskEntity(entity)) {
        const currentUserId = getCurrentUserId();
        return isSignalTask(entity as TaskEntityWithProperties, currentUserId);
      }

      return true;
    }
    case 'email':
      return true;
    case 'project':
      return true;
  }
}

/**
 * Noise filter - less important items.
 * Returns the opposite of signal filter for non-email entities.
 * Emails always pass through since filtering is handled by the backend.
 */
export function noiseFilter(entity: EntityData): boolean {
  if (entity.type === 'email') return true;
  return !signalFilter(entity);
}

