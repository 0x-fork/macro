import type { FilterID } from '@app/component/next-soup/filters/filters';
import {
  signalFilter,
  noiseFilter,
} from '@app/component/next-soup/filters/signal-filters';
import {
  type EntityData,
  isEmailEntity,
  isChannelEntity,
  isDocumentEntity,
  isChatEntity,
} from '@entity';
import {
  // Assignee filters
  hasAssignees,
  isUnassigned,
  isAssignedTo,
  // Status filters
  isNotStarted,
  isInProgress,
  isInReview,
  isCompleted,
  isCanceled,
  isClosed,
  isOpen,
  // Priority filters
  isUrgentPriority,
  isHighPriority,
  isMediumPriority,
  isLowPriority,
  isHighOrUrgentPriority,
  hasNoPriority,
  // Due date filters
  hasDueDate,
  hasNoDueDate,
  isOverdue,
  isDueToday,
  isDueThisWeek,
  isDueSoon,
  // Task structure filters
  hasSubtasks,
  isSubtask,
  isRootTask,
} from './property-filter-utils';

/**
 * Contextual filter that appears based on current list content
 */
export interface ContextualFilter {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Filter predicate function */
  predicate: (entity: EntityData) => boolean;
  /** Which entity types this filter applies to (empty = all) */
  appliesTo?: string[];
  /** Minimum count of matching entities to show this filter */
  minCount?: number;
  /** Category for grouping in UI */
  category?: 'status' | 'time' | 'source' | 'priority' | 'type' | 'assignee';
}

/**
 * Creates a filter that checks if entity is assigned to a specific user
 */
export function createAssignedToMeFilter(
  currentUserId: string | undefined
): ContextualFilter {
  return {
    id: 'task-assigned-to-me',
    label: 'Assigned to Me',
    predicate: (entity) => {
      if (!currentUserId) return false;
      return isAssignedTo(entity, currentUserId);
    },
    appliesTo: ['task'],
    category: 'assignee',
  };
}

/**
 * Contextual filters for email entities
 */
export const EMAIL_CONTEXTUAL_FILTERS: ContextualFilter[] = [
  {
    id: 'email-signal',
    label: 'Priority',
    predicate: (entity) => isEmailEntity(entity) && signalFilter(entity),
    appliesTo: ['email'],
    category: 'priority',
  },
  {
    id: 'email-noise',
    label: 'Low Priority',
    predicate: (entity) => isEmailEntity(entity) && noiseFilter(entity),
    appliesTo: ['email'],
    category: 'priority',
  },
  {
    id: 'email-unread',
    label: 'Unread',
    predicate: (entity) => isEmailEntity(entity) && !entity.isRead,
    appliesTo: ['email'],
    category: 'status',
  },
  {
    id: 'email-read',
    label: 'Read',
    predicate: (entity) => isEmailEntity(entity) && entity.isRead,
    appliesTo: ['email'],
    category: 'status',
  },
  {
    id: 'email-important',
    label: 'Important',
    predicate: (entity) => isEmailEntity(entity) && entity.isImportant,
    appliesTo: ['email'],
    category: 'priority',
  },
  {
    id: 'email-draft',
    label: 'Drafts',
    predicate: (entity) => isEmailEntity(entity) && entity.isDraft,
    appliesTo: ['email'],
    category: 'status',
  },
  {
    id: 'email-done',
    label: 'Done',
    predicate: (entity) => isEmailEntity(entity) && entity.done,
    appliesTo: ['email'],
    category: 'status',
  },
  {
    id: 'email-not-done',
    label: 'Not Done',
    predicate: (entity) => isEmailEntity(entity) && !entity.done,
    appliesTo: ['email'],
    category: 'status',
  },
];

/**
 * Contextual filters for task entities - Status based
 */
export const TASK_STATUS_FILTERS: ContextualFilter[] = [
  {
    id: 'task-not-started',
    label: 'Not Started',
    predicate: isNotStarted,
    appliesTo: ['task'],
    category: 'status',
  },
  {
    id: 'task-in-progress',
    label: 'In Progress',
    predicate: isInProgress,
    appliesTo: ['task'],
    category: 'status',
  },
  {
    id: 'task-in-review',
    label: 'In Review',
    predicate: isInReview,
    appliesTo: ['task'],
    category: 'status',
  },
  {
    id: 'task-completed',
    label: 'Completed',
    predicate: isCompleted,
    appliesTo: ['task'],
    category: 'status',
  },
  {
    id: 'task-canceled',
    label: 'Canceled',
    predicate: isCanceled,
    appliesTo: ['task'],
    category: 'status',
  },
  {
    id: 'task-open',
    label: 'Open',
    predicate: isOpen,
    appliesTo: ['task'],
    category: 'status',
  },
  {
    id: 'task-closed',
    label: 'Closed',
    predicate: isClosed,
    appliesTo: ['task'],
    category: 'status',
  },
];

/**
 * Contextual filters for task entities - Priority based
 */
export const TASK_PRIORITY_FILTERS: ContextualFilter[] = [
  {
    id: 'task-urgent',
    label: 'Urgent',
    predicate: isUrgentPriority,
    appliesTo: ['task'],
    category: 'priority',
  },
  {
    id: 'task-high-priority',
    label: 'High Priority',
    predicate: isHighPriority,
    appliesTo: ['task'],
    category: 'priority',
  },
  {
    id: 'task-medium-priority',
    label: 'Medium Priority',
    predicate: isMediumPriority,
    appliesTo: ['task'],
    category: 'priority',
  },
  {
    id: 'task-low-priority',
    label: 'Low Priority',
    predicate: isLowPriority,
    appliesTo: ['task'],
    category: 'priority',
  },
  {
    id: 'task-high-or-urgent',
    label: 'High or Urgent',
    predicate: isHighOrUrgentPriority,
    appliesTo: ['task'],
    category: 'priority',
  },
  {
    id: 'task-no-priority',
    label: 'No Priority',
    predicate: hasNoPriority,
    appliesTo: ['task'],
    category: 'priority',
  },
];

/**
 * Contextual filters for task entities - Assignee based
 */
export const TASK_ASSIGNEE_FILTERS: ContextualFilter[] = [
  {
    id: 'task-has-assignee',
    label: 'Has Assignee',
    predicate: hasAssignees,
    appliesTo: ['task'],
    category: 'assignee',
  },
  {
    id: 'task-unassigned',
    label: 'Unassigned',
    predicate: isUnassigned,
    appliesTo: ['task'],
    category: 'assignee',
  },
];

/**
 * Contextual filters for task entities - Due date based
 */
export const TASK_DUE_DATE_FILTERS: ContextualFilter[] = [
  {
    id: 'task-overdue',
    label: 'Overdue',
    predicate: isOverdue,
    appliesTo: ['task'],
    category: 'time',
  },
  {
    id: 'task-due-today',
    label: 'Due Today',
    predicate: isDueToday,
    appliesTo: ['task'],
    category: 'time',
  },
  {
    id: 'task-due-soon',
    label: 'Due Soon',
    predicate: isDueSoon,
    appliesTo: ['task'],
    category: 'time',
  },
  {
    id: 'task-due-this-week',
    label: 'Due This Week',
    predicate: isDueThisWeek,
    appliesTo: ['task'],
    category: 'time',
  },
  {
    id: 'task-has-due-date',
    label: 'Has Due Date',
    predicate: hasDueDate,
    appliesTo: ['task'],
    category: 'time',
  },
  {
    id: 'task-no-due-date',
    label: 'No Due Date',
    predicate: hasNoDueDate,
    appliesTo: ['task'],
    category: 'time',
  },
];

/**
 * Contextual filters for task entities - Structure based
 */
export const TASK_STRUCTURE_FILTERS: ContextualFilter[] = [
  {
    id: 'task-has-subtasks',
    label: 'Has Subtasks',
    predicate: hasSubtasks,
    appliesTo: ['task'],
    category: 'type',
  },
  {
    id: 'task-is-subtask',
    label: 'Is Subtask',
    predicate: isSubtask,
    appliesTo: ['task'],
    category: 'type',
  },
  {
    id: 'task-root-task',
    label: 'Root Task',
    predicate: isRootTask,
    appliesTo: ['task'],
    category: 'type',
  },
];

/**
 * All task contextual filters combined
 */
export const TASK_CONTEXTUAL_FILTERS: ContextualFilter[] = [
  ...TASK_STATUS_FILTERS,
  ...TASK_PRIORITY_FILTERS,
  ...TASK_ASSIGNEE_FILTERS,
  ...TASK_DUE_DATE_FILTERS,
  ...TASK_STRUCTURE_FILTERS,
];

/**
 * Contextual filters for document entities
 */
export const DOCUMENT_CONTEXTUAL_FILTERS: ContextualFilter[] = [
  {
    id: 'doc-recent',
    label: 'Recently Edited',
    predicate: (entity) => {
      if (!isDocumentEntity(entity)) return false;
      const updatedAt = entity.updatedAt
        ? new Date(entity.updatedAt)
        : undefined;
      if (!updatedAt) return false;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return updatedAt > dayAgo;
    },
    appliesTo: ['document'],
    category: 'time',
  },
  {
    id: 'doc-edited-this-week',
    label: 'Edited This Week',
    predicate: (entity) => {
      if (!isDocumentEntity(entity)) return false;
      const updatedAt = entity.updatedAt
        ? new Date(entity.updatedAt)
        : undefined;
      if (!updatedAt) return false;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return updatedAt > weekAgo;
    },
    appliesTo: ['document'],
    category: 'time',
  },
  {
    id: 'doc-in-folder',
    label: 'In Folder',
    predicate: (entity) => isDocumentEntity(entity) && !!entity.projectId,
    appliesTo: ['document'],
    category: 'source',
  },
  {
    id: 'doc-standalone',
    label: 'Standalone',
    predicate: (entity) => isDocumentEntity(entity) && !entity.projectId,
    appliesTo: ['document'],
    category: 'source',
  },
  {
    id: 'doc-markdown',
    label: 'Markdown',
    predicate: (entity) =>
      isDocumentEntity(entity) && entity.fileType === 'md',
    appliesTo: ['document'],
    category: 'type',
  },
  {
    id: 'doc-canvas',
    label: 'Canvas',
    predicate: (entity) =>
      isDocumentEntity(entity) && entity.fileType === 'canvas',
    appliesTo: ['document'],
    category: 'type',
  },
];

/**
 * Contextual filters for channel/message entities
 */
export const CHANNEL_CONTEXTUAL_FILTERS: ContextualFilter[] = [
  {
    id: 'channel-direct',
    label: 'Direct Messages',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType === 'direct_message',
    appliesTo: ['channel'],
    category: 'type',
  },
  {
    id: 'channel-group',
    label: 'Group Channels',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType !== 'direct_message',
    appliesTo: ['channel'],
    category: 'type',
  },
  {
    id: 'channel-recent-activity',
    label: 'Recent Activity',
    predicate: (entity) => {
      if (!isChannelEntity(entity)) return false;
      const interactedAt = entity.interactedAt
        ? new Date(entity.interactedAt)
        : undefined;
      if (!interactedAt) return false;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return interactedAt > dayAgo;
    },
    appliesTo: ['channel'],
    category: 'time',
  },
  {
    id: 'channel-public',
    label: 'Public',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType === 'public',
    appliesTo: ['channel'],
    category: 'type',
  },
  {
    id: 'channel-private',
    label: 'Private',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType === 'private',
    appliesTo: ['channel'],
    category: 'type',
  },
];

/**
 * Contextual filters for chat/agent entities
 */
export const CHAT_CONTEXTUAL_FILTERS: ContextualFilter[] = [
  {
    id: 'chat-recent',
    label: 'Recent',
    predicate: (entity) => {
      if (!isChatEntity(entity)) return false;
      const updatedAt = entity.updatedAt
        ? new Date(entity.updatedAt)
        : undefined;
      if (!updatedAt) return false;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return updatedAt > dayAgo;
    },
    appliesTo: ['chat'],
    category: 'time',
  },
  {
    id: 'chat-in-project',
    label: 'In Project',
    predicate: (entity) => isChatEntity(entity) && !!entity.projectId,
    appliesTo: ['chat'],
    category: 'source',
  },
  {
    id: 'chat-standalone',
    label: 'Standalone',
    predicate: (entity) => isChatEntity(entity) && !entity.projectId,
    appliesTo: ['chat'],
    category: 'source',
  },
];

/**
 * General contextual filters that apply to multiple entity types
 */
export const GENERAL_CONTEXTUAL_FILTERS: ContextualFilter[] = [
  {
    id: 'recently-viewed',
    label: 'Recently Viewed',
    predicate: (entity) => {
      const viewedAt = entity.viewedAt ? new Date(entity.viewedAt) : undefined;
      if (!viewedAt) return false;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return viewedAt > hourAgo;
    },
    category: 'time',
  },
  {
    id: 'recently-created',
    label: 'Recently Created',
    predicate: (entity) => {
      const createdAt = entity.createdAt
        ? new Date(entity.createdAt)
        : undefined;
      if (!createdAt) return false;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return createdAt > weekAgo;
    },
    category: 'time',
  },
  {
    id: 'recently-updated',
    label: 'Recently Updated',
    predicate: (entity) => {
      const updatedAt = entity.updatedAt
        ? new Date(entity.updatedAt)
        : undefined;
      if (!updatedAt) return false;
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return updatedAt > dayAgo;
    },
    category: 'time',
  },
  {
    id: 'high-frecency',
    label: 'Frequently Used',
    predicate: (entity) => {
      const score = entity.frecencyScore ?? 0;
      return score > 100; // High frecency threshold
    },
    category: 'priority',
  },
];

/**
 * All contextual filters grouped by category
 */
export const ALL_CONTEXTUAL_FILTERS = [
  ...EMAIL_CONTEXTUAL_FILTERS,
  ...TASK_CONTEXTUAL_FILTERS,
  ...DOCUMENT_CONTEXTUAL_FILTERS,
  ...CHANNEL_CONTEXTUAL_FILTERS,
  ...CHAT_CONTEXTUAL_FILTERS,
  ...GENERAL_CONTEXTUAL_FILTERS,
];

/**
 * Get relevant contextual filters based on active main filters.
 * Optionally includes user-specific filters like "Assigned to Me".
 */
export function getContextualFiltersForActiveFilters(
  activeFilterIds: FilterID[],
  currentUserId?: string
): ContextualFilter[] {
  const relevantFilters: ContextualFilter[] = [];

  // Determine which entity types are active
  const hasEmail = activeFilterIds.includes('email');
  const hasTask = activeFilterIds.includes('task');
  const hasDocument = activeFilterIds.includes('document');
  const hasChannel =
    activeFilterIds.includes('people') ||
    activeFilterIds.includes('teams') ||
    activeFilterIds.includes('teams-and-people');
  const hasChat = activeFilterIds.includes('agent');
  const hasNoTypeFilter =
    !hasEmail && !hasTask && !hasDocument && !hasChannel && !hasChat;

  // Add email filters
  if (hasEmail || hasNoTypeFilter) {
    relevantFilters.push(...EMAIL_CONTEXTUAL_FILTERS);
  }

  // Add task filters
  if (hasTask || hasNoTypeFilter) {
    relevantFilters.push(...TASK_CONTEXTUAL_FILTERS);

    // Add "Assigned to Me" filter if we have a user ID
    if (currentUserId) {
      relevantFilters.push(createAssignedToMeFilter(currentUserId));
    }
  }

  // Add document filters
  if (hasDocument || hasNoTypeFilter) {
    relevantFilters.push(...DOCUMENT_CONTEXTUAL_FILTERS);
  }

  // Add channel filters
  if (hasChannel || hasNoTypeFilter) {
    relevantFilters.push(...CHANNEL_CONTEXTUAL_FILTERS);
  }

  // Add chat/agent filters
  if (hasChat || hasNoTypeFilter) {
    relevantFilters.push(...CHAT_CONTEXTUAL_FILTERS);
  }

  // Always include general filters if showing mixed content
  if (hasNoTypeFilter || activeFilterIds.length === 0) {
    relevantFilters.push(...GENERAL_CONTEXTUAL_FILTERS);
  }

  return relevantFilters;
}

/**
 * Filter entities using contextual filter
 */
export function applyContextualFilter(
  entities: EntityData[],
  filter: ContextualFilter
): EntityData[] {
  return entities.filter(filter.predicate);
}

/**
 * Count matching entities for a contextual filter
 */
export function countMatchingEntities(
  entities: EntityData[],
  filter: ContextualFilter
): number {
  return entities.filter(filter.predicate).length;
}
