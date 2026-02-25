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
import type { Component, JSX } from 'solid-js';

// Phosphor icons for contextual filters
import IconBell from '@icon/regular/bell.svg';
import IconBellSlash from '@icon/regular/bell-slash.svg';
import IconEnvelope from '@icon/regular/envelope.svg';
import IconEnvelopeOpen from '@icon/regular/envelope-open.svg';
import IconStar from '@icon/regular/star.svg';
import IconPencilSimple from '@icon/regular/pencil-simple.svg';
import IconCheckCircle from '@icon/regular/check-circle.svg';
import IconCircle from '@icon/regular/circle.svg';
import IconCircleDashed from '@icon/regular/circle-dashed.svg';
import IconClock from '@icon/regular/clock.svg';
import IconEye from '@icon/regular/eye.svg';
import IconXCircle from '@icon/regular/x-circle.svg';
import IconWarning from '@icon/regular/warning.svg';
import IconArrowUp from '@icon/regular/arrow-up.svg';
import IconMinus from '@icon/regular/minus.svg';
import IconArrowDown from '@icon/regular/arrow-down.svg';
import IconUser from '@icon/regular/user.svg';
import IconUserCircle from '@icon/regular/user-circle.svg';
import IconCalendar from '@icon/regular/calendar.svg';
import IconCalendarX from '@icon/regular/calendar-x.svg';
import IconCalendarCheck from '@icon/regular/calendar-check.svg';
import IconTreeStructure from '@icon/regular/tree-structure.svg';
import IconFileText from '@icon/regular/file-text.svg';
import IconFolder from '@icon/regular/folder.svg';
import IconChatCircle from '@icon/regular/chat-circle.svg';
import IconUsers from '@icon/regular/users.svg';
import IconGlobe from '@icon/regular/globe.svg';
import IconLock from '@icon/regular/lock.svg';
import IconClockCountdown from '@icon/regular/clock-countdown.svg';
import IconPaperPlaneTilt from '@icon/regular/paper-plane-tilt.svg';

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
  /** Optional icon component */
  icon?: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
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
    icon: IconUser,
  };
}

/**
 * Creates a filter that checks if email was sent by the current user
 */
export function createSentByMeFilter(
  currentUserEmail: string | undefined
): ContextualFilter {
  return {
    id: 'email-sent-by-me',
    label: 'Sent',
    predicate: (entity) => {
      if (!currentUserEmail) return false;
      if (!isEmailEntity(entity)) return false;
      return (
        entity.senderEmail?.toLowerCase() === currentUserEmail.toLowerCase()
      );
    },
    appliesTo: ['email'],
    category: 'status',
    icon: IconPaperPlaneTilt,
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
    icon: IconBell,
  },
  {
    id: 'email-noise',
    label: 'Low Priority',
    predicate: (entity) => isEmailEntity(entity) && noiseFilter(entity),
    appliesTo: ['email'],
    category: 'priority',
    icon: IconBellSlash,
  },
  {
    id: 'email-unread',
    label: 'Unread',
    predicate: (entity) => isEmailEntity(entity) && !entity.isRead,
    appliesTo: ['email'],
    category: 'status',
    icon: IconEnvelope,
  },
  {
    id: 'email-read',
    label: 'Read',
    predicate: (entity) => isEmailEntity(entity) && entity.isRead,
    appliesTo: ['email'],
    category: 'status',
    icon: IconEnvelopeOpen,
  },
  {
    id: 'email-important',
    label: 'Important',
    predicate: (entity) => isEmailEntity(entity) && entity.isImportant,
    appliesTo: ['email'],
    category: 'priority',
    icon: IconStar,
  },
  {
    id: 'email-draft',
    label: 'Drafts',
    predicate: (entity) => isEmailEntity(entity) && entity.isDraft,
    appliesTo: ['email'],
    category: 'status',
    icon: IconPencilSimple,
  },
  {
    id: 'email-done',
    label: 'Done',
    predicate: (entity) => isEmailEntity(entity) && entity.done,
    appliesTo: ['email'],
    category: 'status',
    icon: IconCheckCircle,
  },
  {
    id: 'email-not-done',
    label: 'Not Done',
    predicate: (entity) => isEmailEntity(entity) && !entity.done,
    appliesTo: ['email'],
    category: 'status',
    icon: IconCircle,
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
    icon: IconCircleDashed,
  },
  {
    id: 'task-in-progress',
    label: 'In Progress',
    predicate: isInProgress,
    appliesTo: ['task'],
    category: 'status',
    icon: IconClock,
  },
  {
    id: 'task-in-review',
    label: 'In Review',
    predicate: isInReview,
    appliesTo: ['task'],
    category: 'status',
    icon: IconEye,
  },
  {
    id: 'task-completed',
    label: 'Completed',
    predicate: isCompleted,
    appliesTo: ['task'],
    category: 'status',
    icon: IconCheckCircle,
  },
  {
    id: 'task-canceled',
    label: 'Canceled',
    predicate: isCanceled,
    appliesTo: ['task'],
    category: 'status',
    icon: IconXCircle,
  },
  {
    id: 'task-open',
    label: 'Open',
    predicate: isOpen,
    appliesTo: ['task'],
    category: 'status',
    icon: IconCircle,
  },
  {
    id: 'task-closed',
    label: 'Closed',
    predicate: isClosed,
    appliesTo: ['task'],
    category: 'status',
    icon: IconCheckCircle,
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
    icon: IconWarning,
  },
  {
    id: 'task-high-priority',
    label: 'High Priority',
    predicate: isHighPriority,
    appliesTo: ['task'],
    category: 'priority',
    icon: IconArrowUp,
  },
  {
    id: 'task-medium-priority',
    label: 'Medium Priority',
    predicate: isMediumPriority,
    appliesTo: ['task'],
    category: 'priority',
    icon: IconMinus,
  },
  {
    id: 'task-low-priority',
    label: 'Low Priority',
    predicate: isLowPriority,
    appliesTo: ['task'],
    category: 'priority',
    icon: IconArrowDown,
  },
  {
    id: 'task-high-or-urgent',
    label: 'High or Urgent',
    predicate: isHighOrUrgentPriority,
    appliesTo: ['task'],
    category: 'priority',
    icon: IconWarning,
  },
  {
    id: 'task-no-priority',
    label: 'No Priority',
    predicate: hasNoPriority,
    appliesTo: ['task'],
    category: 'priority',
    icon: IconMinus,
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
    icon: IconUser,
  },
  {
    id: 'task-unassigned',
    label: 'Unassigned',
    predicate: isUnassigned,
    appliesTo: ['task'],
    category: 'assignee',
    icon: IconUserCircle,
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
    icon: IconWarning,
  },
  {
    id: 'task-due-today',
    label: 'Due Today',
    predicate: isDueToday,
    appliesTo: ['task'],
    category: 'time',
    icon: IconCalendar,
  },
  {
    id: 'task-due-soon',
    label: 'Due Soon',
    predicate: isDueSoon,
    appliesTo: ['task'],
    category: 'time',
    icon: IconClockCountdown,
  },
  {
    id: 'task-due-this-week',
    label: 'Due This Week',
    predicate: isDueThisWeek,
    appliesTo: ['task'],
    category: 'time',
    icon: IconCalendarCheck,
  },
  {
    id: 'task-has-due-date',
    label: 'Has Due Date',
    predicate: hasDueDate,
    appliesTo: ['task'],
    category: 'time',
    icon: IconCalendar,
  },
  {
    id: 'task-no-due-date',
    label: 'No Due Date',
    predicate: hasNoDueDate,
    appliesTo: ['task'],
    category: 'time',
    icon: IconCalendarX,
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
    icon: IconTreeStructure,
  },
  {
    id: 'task-is-subtask',
    label: 'Is Subtask',
    predicate: isSubtask,
    appliesTo: ['task'],
    category: 'type',
    icon: IconTreeStructure,
  },
  {
    id: 'task-root-task',
    label: 'Root Task',
    predicate: isRootTask,
    appliesTo: ['task'],
    category: 'type',
    icon: IconCircle,
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
    icon: IconClock,
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
    icon: IconCalendar,
  },
  {
    id: 'doc-in-folder',
    label: 'In Folder',
    predicate: (entity) => isDocumentEntity(entity) && !!entity.projectId,
    appliesTo: ['document'],
    category: 'source',
    icon: IconFolder,
  },
  {
    id: 'doc-standalone',
    label: 'Standalone',
    predicate: (entity) => isDocumentEntity(entity) && !entity.projectId,
    appliesTo: ['document'],
    category: 'source',
    icon: IconFileText,
  },
  {
    id: 'doc-markdown',
    label: 'Markdown',
    predicate: (entity) => isDocumentEntity(entity) && entity.fileType === 'md',
    appliesTo: ['document'],
    category: 'type',
    icon: IconFileText,
  },
  {
    id: 'doc-canvas',
    label: 'Canvas',
    predicate: (entity) =>
      isDocumentEntity(entity) && entity.fileType === 'canvas',
    appliesTo: ['document'],
    category: 'type',
    icon: IconFileText,
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
    icon: IconChatCircle,
  },
  {
    id: 'channel-group',
    label: 'Group Channels',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType !== 'direct_message',
    appliesTo: ['channel'],
    category: 'type',
    icon: IconUsers,
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
    icon: IconClock,
  },
  {
    id: 'channel-public',
    label: 'Public',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType === 'public',
    appliesTo: ['channel'],
    category: 'type',
    icon: IconGlobe,
  },
  {
    id: 'channel-private',
    label: 'Private',
    predicate: (entity) =>
      isChannelEntity(entity) && entity.channelType === 'private',
    appliesTo: ['channel'],
    category: 'type',
    icon: IconLock,
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
    icon: IconClock,
  },
  {
    id: 'chat-in-project',
    label: 'In Project',
    predicate: (entity) => isChatEntity(entity) && !!entity.projectId,
    appliesTo: ['chat'],
    category: 'source',
    icon: IconFolder,
  },
  {
    id: 'chat-standalone',
    label: 'Standalone',
    predicate: (entity) => isChatEntity(entity) && !entity.projectId,
    appliesTo: ['chat'],
    category: 'source',
    icon: IconChatCircle,
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
    icon: IconEye,
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
    icon: IconClock,
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
    icon: IconClock,
  },
  {
    id: 'high-frecency',
    label: 'Frequently Used',
    predicate: (entity) => {
      const score = entity.frecencyScore ?? 0;
      return score > 100; // High frecency threshold
    },
    category: 'priority',
    icon: IconStar,
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
  currentUserId?: string,
  currentUserEmail?: string
): ContextualFilter[] {
  const relevantFilters: ContextualFilter[] = [];

  // Determine which entity types are active
  const hasEmail = activeFilterIds.includes('email');
  const hasTask = activeFilterIds.includes('task');
  const hasDocument = activeFilterIds.includes('document');
  const hasChannel =
    activeFilterIds.includes('people') ||
    activeFilterIds.includes('teams');
  const hasChat = activeFilterIds.includes('agent');
  const hasNoTypeFilter =
    !hasEmail && !hasTask && !hasDocument && !hasChannel && !hasChat;

  // Add email filters
  if (hasEmail || hasNoTypeFilter) {
    relevantFilters.push(...EMAIL_CONTEXTUAL_FILTERS);

    // Add "Sent" filter if we have a user email
    if (currentUserEmail) {
      relevantFilters.push(createSentByMeFilter(currentUserEmail));
    }
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
