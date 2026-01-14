/**
 * Activity Types with their point values
 *
 * Point values are based on the effort/value of each action:
 * - High value actions (email, inbox 0): 5000-10000 pts
 * - Medium value actions (messages, document sharing): 500-1000 pts
 * - Low value actions (creating files, marking done): 10-100 pts
 * - Micro actions (keystrokes, passive time): 1-10 pts
 */

export const ActivityType = {
  // High value actions
  EMAIL_SENT: 'email_sent',
  INBOX_ZERO: 'inbox_zero',

  // Medium value actions
  MESSAGE_SENT: 'message_sent',
  DOCUMENT_SHARED: 'document_shared',

  // Standard actions
  FILE_CREATED: 'file_created',
  TASK_COMPLETED: 'task_completed',

  // Micro actions
  KEYSTROKE_INPUT: 'keystroke_input',
  KEYSTROKE_GLOBAL: 'keystroke_global',
  PASSIVE_TIME: 'passive_time',
} as const;

export type ActivityTypeValue = (typeof ActivityType)[keyof typeof ActivityType];

/**
 * Point values for each activity type
 */
export const ACTIVITY_POINTS: Record<ActivityTypeValue, number> = {
  [ActivityType.EMAIL_SENT]: 5000,
  [ActivityType.INBOX_ZERO]: 10000,
  [ActivityType.MESSAGE_SENT]: 500,
  [ActivityType.DOCUMENT_SHARED]: 1000,
  [ActivityType.FILE_CREATED]: 100,
  [ActivityType.TASK_COMPLETED]: 10,
  [ActivityType.KEYSTROKE_INPUT]: 10,
  [ActivityType.KEYSTROKE_GLOBAL]: 1,
  [ActivityType.PASSIVE_TIME]: 10, // per minute
};

/**
 * Human-readable labels for activity types
 */
export const ACTIVITY_LABELS: Record<ActivityTypeValue, string> = {
  [ActivityType.EMAIL_SENT]: 'Email sent',
  [ActivityType.INBOX_ZERO]: 'Inbox zero achieved',
  [ActivityType.MESSAGE_SENT]: 'Message sent',
  [ActivityType.DOCUMENT_SHARED]: 'Document shared',
  [ActivityType.FILE_CREATED]: 'File created',
  [ActivityType.TASK_COMPLETED]: 'Task completed',
  [ActivityType.KEYSTROKE_INPUT]: 'Typing in input',
  [ActivityType.KEYSTROKE_GLOBAL]: 'Keystroke',
  [ActivityType.PASSIVE_TIME]: 'Active in app',
};

/**
 * Activity entry representing a single logged action
 */
export interface ActivityEntry {
  id: string;
  type: ActivityTypeValue;
  points: number;
  timestamp: number; // Unix timestamp in ms
  metadata?: {
    url?: string;
    title?: string;
    description?: string;
    [key: string]: unknown;
  };
}

/**
 * Daily activity summary
 */
export interface DailySummary {
  date: string; // YYYY-MM-DD format
  totalPoints: number;
  activities: ActivityEntry[];
  breakdown: Record<ActivityTypeValue, { count: number; points: number }>;
}

/**
 * Activity state stored in localStorage
 */
export interface ActivityState {
  /** Current day's activities */
  today: DailySummary;
  /** Historical daily summaries (last 30 days) */
  history: DailySummary[];
  /** Total lifetime points */
  lifetimePoints: number;
  /** Last time passive tracking was updated */
  lastPassiveUpdate: number;
}

/**
 * Get today's date in YYYY-MM-DD format
 */
export function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Generate a unique ID for an activity entry
 */
export function generateActivityId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
