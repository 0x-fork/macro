/**
 * Signal/Noise Filter Predicates
 *
 * Pure filter functions for classifying entities as signal (important) or noise (less important).
 *
 * Signal/Noise Logic:
 * - Channels: Always signal (they require explicit joining)
 * - Chats: Signal if recently viewed
 * - Documents: Tasks always signal, others if recently viewed
 * - Emails: Based on priority/depriority labels and metadata
 * - Projects: Signal if recently viewed
 */

import {
  isTaskEntity,
  TaskEntityWithProperties,
  type EntityData,
} from '@macro-entity';
import {
  PRIORITY_LABELS,
  DEPRIORITY_LABELS,
  PRIORITY_METADATA,
  DEPRIORITY_METADATA,
  type EmailMetadataKey,
} from './signal-config';
import {
  getTaskAssigneeIds,
  isTaskClosed,
} from '@app/component/Soup/utils/filterHelpers';
import { useUserId } from '@core/context/user';

// ============================================================================
// Helper Functions
// ============================================================================

/** Extract label tokens from email labels for matching */
const getLabelTokens = (
  labels?: Array<{ id?: string; providerLabelId?: string; name?: string }>
): string[] => {
  if (!labels?.length) return [];

  const tokens: string[] = [];
  for (const label of labels) {
    if (label.id) tokens.push(label.id);
    if (label.providerLabelId) tokens.push(label.providerLabelId);
    if (label.name) tokens.push(label.name);
  }

  return tokens.map((token) => token.toUpperCase());
};

/** Email metadata type (simplified for our needs) */
type EmailMetadata = {
  knownSender?: boolean;
  tabular?: boolean;
  genericSender?: boolean;
  // snake_case versions
  known_sender?: boolean;
  generic_sender?: boolean;
};

/**
 * Safely get metadata value handling both camelCase and snake_case formats.
 * This handles the difference between API formats.
 */
const getMetadataValue = (
  metadata: EmailMetadata | undefined,
  key: EmailMetadataKey
): boolean | undefined => {
  if (!metadata) return undefined;

  // Check camelCase format
  if (key in metadata) {
    return metadata[key as keyof EmailMetadata] as boolean | undefined;
  }

  // Check snake_case format
  const snakeCaseKey = key
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase() as keyof EmailMetadata;
  if (snakeCaseKey in metadata) {
    return metadata[snakeCaseKey] as boolean | undefined;
  }

  return undefined;
};

/** Check if entity was recently viewed (within last 24 hours) */
const hasRecentlyViewed = (entity: EntityData): boolean => {
  if (!entity.viewedAt) return false;

  const now = Date.now();
  const viewedAt = new Date(entity.viewedAt).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  return now - viewedAt < oneDayMs;
};

// ============================================================================
// Email Signal Analysis
// ============================================================================

type EmailEntity = Extract<EntityData, { type: 'email' }>;

/** Analyze email for priority/depriority indicators */
function getEmailSignalInfo(entity: EmailEntity): {
  hasPriority: boolean;
  hasDepriority: boolean;
} {
  const labelTokens = getLabelTokens(entity.labels);
  const priorityLabels = PRIORITY_LABELS();
  const depriorityLabels = DEPRIORITY_LABELS();
  const priorityMetadata = PRIORITY_METADATA();
  const depriorityMetadata = DEPRIORITY_METADATA();

  const hasPriorityLabel = labelTokens.some((label) =>
    priorityLabels.has(label)
  );
  const hasDeprioritizingLabel = labelTokens.some((label) =>
    depriorityLabels.has(label)
  );

  const metadata = entity.metadata as EmailMetadata | undefined;
  const hasPriorityMetadata = metadata
    ? Array.from(priorityMetadata).some(
        (key) => getMetadataValue(metadata, key) === true
      )
    : false;
  const hasDeprioritizingMetadata = metadata
    ? Array.from(depriorityMetadata).some(
        (key) => getMetadataValue(metadata, key) === true
      )
    : false;

  return {
    hasPriority: hasPriorityMetadata || hasPriorityLabel,
    hasDepriority: hasDeprioritizingLabel || hasDeprioritizingMetadata,
  };
}

/** Check if email is signal (important) */
function isSignalEmail(entity: EmailEntity): boolean {
  const { hasPriority, hasDepriority } = getEmailSignalInfo(entity);
  // Signal = has priority indicators OR no depriority indicators
  return hasPriority || !hasDepriority;
}

/** Check if email is noise (less important) */
function isNoiseEmail(entity: EmailEntity): boolean {
  const { hasPriority, hasDepriority } = getEmailSignalInfo(entity);
  // Noise = has depriority indicators AND no priority indicators
  return hasDepriority && !hasPriority;
}

/**
 * checks if the current user is assigned to the task.
 */
export const isCurrentUserAssigned = (
  entity: TaskEntityWithProperties,
  currentUserId: string | undefined
): boolean => {
  if (!currentUserId) return false;
  const assigneeIds = getTaskAssigneeIds(entity);
  if (assigneeIds.length === 0) return true;
  return assigneeIds.includes(currentUserId);
};

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

// ============================================================================
// Filter Predicates
// ============================================================================

/**
 * Signal filter - important/prioritized items.
 *
 * Classification:
 * - Channels: Always signal (explicit membership)
 * - Chats: Signal if recently viewed
 * - Documents: Tasks always signal, others if recently viewed
 * - Emails: Based on priority/depriority labels and metadata
 * - Projects: Signal if recently viewed
 */
export function signalFilter(entity: EntityData): boolean {
  switch (entity.type) {
    case 'channel':
      return true;
    case 'chat':
      return hasRecentlyViewed(entity);
    case 'document': {
      if (isTaskEntity(entity)) {
        const currentUserId = getCurrentUserId();
        return isSignalTask(entity as TaskEntityWithProperties, currentUserId);
      }

      return hasRecentlyViewed(entity);
    }
    case 'email':
      return isSignalEmail(entity) || entity.isDraft;
    case 'project':
      return hasRecentlyViewed(entity);
  }
}

/**
 * Noise filter - less important items.
 * Returns the opposite of signal filter.
 */
export function noiseFilter(entity: EntityData): boolean {
  return !signalFilter(entity);
}

/**
 * Explicit noise filter - only true for items with explicit noise indicators.
 *
 * Currently only emails can be "explicit noise" (those with depriority labels/metadata).
 * Non-email items are never considered explicit noise (they're neutral).
 *
 * This is used when NO focus filter is selected to hide explicitly noisy items.
 */
export function explicitNoiseFilter(entity: EntityData): boolean {
  if (entity.type === 'email') {
    return isNoiseEmail(entity);
  }
  // Non-email items are never explicit noise
  return false;
}
