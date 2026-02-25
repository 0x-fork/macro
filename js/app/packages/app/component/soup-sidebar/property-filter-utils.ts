/**
 * Utility functions for filtering entities based on their properties.
 * Used by contextual filters to support property-based filtering like assignee, status, priority, etc.
 */

import {
  SYSTEM_PROPERTY_IDS,
  PROPERTY_OPTION_IDS,
} from '@core/component/Properties/constants';
import type { EntityData, TaskEntityWithProperties } from '@entity';
import { isTaskEntity } from '@entity';
import type { SoupProperty } from '@service-storage/generated/schemas';

/**
 * Type guard to check if entity has properties
 */
export function hasProperties(
  entity: EntityData
): entity is EntityData & { properties: SoupProperty[] } {
  return 'properties' in entity && Array.isArray(entity.properties);
}

/**
 * Get a property by definition ID from an entity
 */
export function getPropertyById(
  entity: EntityData,
  propertyId: string
): SoupProperty | undefined {
  if (!hasProperties(entity)) return undefined;
  return entity.properties.find((p) => p.definition.id === propertyId);
}

/**
 * Get assignee user IDs from a task entity
 */
export function getAssigneeIds(entity: EntityData): string[] {
  if (!isTaskEntity(entity)) return [];
  const taskWithProps = entity as TaskEntityWithProperties;
  const properties = taskWithProps.properties;
  if (!properties) return [];

  const assigneesProperty = properties.find(
    (p) => p.definition.id === SYSTEM_PROPERTY_IDS.ASSIGNEES
  );
  if (!assigneesProperty?.value) return [];

  const value = assigneesProperty.value;
  if (value.type === 'EntityReference' && Array.isArray(value.value)) {
    return value.value
      .filter((ref) => ref.entity_type === 'USER')
      .map((ref) => ref.entity_id);
  }

  return [];
}

/**
 * Check if entity has any assignees
 */
export function hasAssignees(entity: EntityData): boolean {
  return getAssigneeIds(entity).length > 0;
}

/**
 * Check if a specific user is assigned to the entity
 */
export function isAssignedTo(entity: EntityData, userId: string): boolean {
  const assigneeIds = getAssigneeIds(entity);
  // If no assignees, consider it assigned to everyone (or unassigned)
  if (assigneeIds.length === 0) return false;
  return assigneeIds.includes(userId);
}

/**
 * Check if entity is unassigned (no assignees)
 */
export function isUnassigned(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  return getAssigneeIds(entity).length === 0;
}

/**
 * Get the status option ID from a task entity
 */
export function getStatusOptionId(entity: EntityData): string | undefined {
  if (!isTaskEntity(entity)) return undefined;
  const taskWithProps = entity as TaskEntityWithProperties;
  const properties = taskWithProps.properties;
  if (!properties) return undefined;

  const statusProperty = properties.find(
    (p) => p.definition.id === SYSTEM_PROPERTY_IDS.STATUS
  );
  if (!statusProperty?.value) return undefined;

  const value = statusProperty.value;
  if (
    value.type === 'SelectOption' &&
    'value' in value &&
    Array.isArray(value.value)
  ) {
    return value.value[0];
  }

  return undefined;
}

/**
 * Check if task has a specific status
 */
export function hasStatus(entity: EntityData, statusOptionId: string): boolean {
  return getStatusOptionId(entity) === statusOptionId;
}

/**
 * Check if task is not started
 */
export function isNotStarted(entity: EntityData): boolean {
  return hasStatus(entity, PROPERTY_OPTION_IDS.STATUS.NOT_STARTED);
}

/**
 * Check if task is in progress
 */
export function isInProgress(entity: EntityData): boolean {
  return hasStatus(entity, PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS);
}

/**
 * Check if task is in review
 */
export function isInReview(entity: EntityData): boolean {
  return hasStatus(entity, PROPERTY_OPTION_IDS.STATUS.IN_REVIEW);
}

/**
 * Check if task is completed
 */
export function isCompleted(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  // Check both the subType flag and status property
  if (entity.subType?.is_completed) return true;
  return hasStatus(entity, PROPERTY_OPTION_IDS.STATUS.COMPLETED);
}

/**
 * Check if task is canceled
 */
export function isCanceled(entity: EntityData): boolean {
  return hasStatus(entity, PROPERTY_OPTION_IDS.STATUS.CANCELED);
}

/**
 * Check if task is closed (completed or canceled)
 */
export function isClosed(entity: EntityData): boolean {
  return isCompleted(entity) || isCanceled(entity);
}

/**
 * Check if task is open (not closed)
 */
export function isOpen(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  return !isClosed(entity);
}

/**
 * Get the priority option ID from a task entity
 */
export function getPriorityOptionId(entity: EntityData): string | undefined {
  if (!isTaskEntity(entity)) return undefined;
  const taskWithProps = entity as TaskEntityWithProperties;
  const properties = taskWithProps.properties;
  if (!properties) return undefined;

  const priorityProperty = properties.find(
    (p) => p.definition.id === SYSTEM_PROPERTY_IDS.PRIORITY
  );
  if (!priorityProperty?.value) return undefined;

  const value = priorityProperty.value;
  if (
    value.type === 'SelectOption' &&
    'value' in value &&
    Array.isArray(value.value)
  ) {
    return value.value[0];
  }

  return undefined;
}

/**
 * Check if task has a specific priority
 */
export function hasPriority(
  entity: EntityData,
  priorityOptionId: string
): boolean {
  return getPriorityOptionId(entity) === priorityOptionId;
}

/**
 * Check if task is urgent priority
 */
export function isUrgentPriority(entity: EntityData): boolean {
  return hasPriority(entity, PROPERTY_OPTION_IDS.PRIORITY.URGENT);
}

/**
 * Check if task is high priority
 */
export function isHighPriority(entity: EntityData): boolean {
  return hasPriority(entity, PROPERTY_OPTION_IDS.PRIORITY.HIGH);
}

/**
 * Check if task is medium priority
 */
export function isMediumPriority(entity: EntityData): boolean {
  return hasPriority(entity, PROPERTY_OPTION_IDS.PRIORITY.MEDIUM);
}

/**
 * Check if task is low priority
 */
export function isLowPriority(entity: EntityData): boolean {
  return hasPriority(entity, PROPERTY_OPTION_IDS.PRIORITY.LOW);
}

/**
 * Check if task has high or urgent priority
 */
export function isHighOrUrgentPriority(entity: EntityData): boolean {
  return isHighPriority(entity) || isUrgentPriority(entity);
}

/**
 * Check if task has no priority set
 */
export function hasNoPriority(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  return getPriorityOptionId(entity) === undefined;
}

/**
 * Get the due date from a task entity
 */
export function getDueDate(entity: EntityData): Date | undefined {
  if (!isTaskEntity(entity)) return undefined;
  const taskWithProps = entity as TaskEntityWithProperties;
  const properties = taskWithProps.properties;
  if (!properties) return undefined;

  const dueDateProperty = properties.find(
    (p) => p.definition.id === SYSTEM_PROPERTY_IDS.DUE_DATE
  );
  if (!dueDateProperty?.value) return undefined;

  const value = dueDateProperty.value;
  if (value.type === 'Date' && typeof value.value === 'string') {
    return new Date(value.value);
  }

  return undefined;
}

/**
 * Check if task has a due date
 */
export function hasDueDate(entity: EntityData): boolean {
  return getDueDate(entity) !== undefined;
}

/**
 * Check if task has no due date
 */
export function hasNoDueDate(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  return getDueDate(entity) === undefined;
}

/**
 * Check if task is overdue (due date in the past and not completed)
 */
export function isOverdue(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  if (isClosed(entity)) return false;

  const dueDate = getDueDate(entity);
  if (!dueDate) return false;

  const now = new Date();
  // Set to end of day for comparison
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  return dueDate < endOfToday;
}

/**
 * Check if task is due today
 */
export function isDueToday(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;

  const dueDate = getDueDate(entity);
  if (!dueDate) return false;

  const now = new Date();
  return (
    dueDate.getDate() === now.getDate() &&
    dueDate.getMonth() === now.getMonth() &&
    dueDate.getFullYear() === now.getFullYear()
  );
}

/**
 * Check if task is due this week (next 7 days)
 */
export function isDueThisWeek(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;

  const dueDate = getDueDate(entity);
  if (!dueDate) return false;

  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return dueDate >= now && dueDate <= weekFromNow;
}

/**
 * Check if task is due soon (within 3 days)
 */
export function isDueSoon(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  if (isClosed(entity)) return false;

  const dueDate = getDueDate(entity);
  if (!dueDate) return false;

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  return dueDate >= now && dueDate <= threeDaysFromNow;
}

/**
 * Check if task has parent task
 */
export function hasParentTask(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  const taskWithProps = entity as TaskEntityWithProperties;
  const properties = taskWithProps.properties;
  if (!properties) return false;

  const parentProperty = properties.find(
    (p) => p.definition.id === SYSTEM_PROPERTY_IDS.PARENT_TASK
  );
  if (!parentProperty?.value) return false;

  const value = parentProperty.value;
  if (value.type === 'EntityReference' && Array.isArray(value.value)) {
    return value.value.length > 0;
  }

  return false;
}

/**
 * Check if task has subtasks
 */
export function hasSubtasks(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  const taskWithProps = entity as TaskEntityWithProperties;
  const properties = taskWithProps.properties;
  if (!properties) return false;

  const subtasksProperty = properties.find(
    (p) => p.definition.id === SYSTEM_PROPERTY_IDS.SUBTASKS
  );
  if (!subtasksProperty?.value) return false;

  const value = subtasksProperty.value;
  if (value.type === 'EntityReference' && Array.isArray(value.value)) {
    return value.value.length > 0;
  }

  return false;
}

/**
 * Check if task is a subtask (has a parent)
 */
export function isSubtask(entity: EntityData): boolean {
  return hasParentTask(entity);
}

/**
 * Check if task is a root task (no parent)
 */
export function isRootTask(entity: EntityData): boolean {
  if (!isTaskEntity(entity)) return false;
  return !hasParentTask(entity);
}
