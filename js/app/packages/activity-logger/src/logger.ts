/**
 * Activity Logger - Core logging functionality
 *
 * Usage:
 *   import { logActivity, ActivityType } from '@macro/activity-logger';
 *
 *   // Log a simple activity
 *   logActivity(ActivityType.EMAIL_SENT);
 *
 *   // Log with metadata
 *   logActivity(ActivityType.EMAIL_SENT, {
 *     title: 'Re: Project Update',
 *     url: 'mailto:...'
 *   });
 */

import type { ActivityTypeValue, ActivityEntry, ActivityState } from './types';
import { ActivityType, ACTIVITY_POINTS, generateActivityId } from './types';
import { addActivity, loadState, setLastPassiveUpdate, getLastPassiveUpdate } from './storage';

// Event emitter for UI updates
type ActivityListener = (state: ActivityState) => void;
const listeners: Set<ActivityListener> = new Set();

/**
 * Subscribe to activity updates
 */
export function subscribeToActivity(listener: ActivityListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Notify all listeners of state change
 */
function notifyListeners(state: ActivityState): void {
  listeners.forEach((listener) => listener(state));
}

/**
 * Log an activity with automatic point calculation
 *
 * @param type - The type of activity
 * @param metadata - Optional metadata about the activity
 * @returns The created activity entry
 */
export function logActivity(
  type: ActivityTypeValue,
  metadata?: ActivityEntry['metadata']
): ActivityEntry {
  const entry: ActivityEntry = {
    id: generateActivityId(),
    type,
    points: ACTIVITY_POINTS[type],
    timestamp: Date.now(),
    metadata,
  };

  const newState = addActivity(entry);
  notifyListeners(newState);

  // Debug logging in dev mode
  if (import.meta.env?.DEV) {
    console.log(
      `[ActivityLogger] +${entry.points} pts for ${type}`,
      metadata ? metadata : ''
    );
  }

  return entry;
}

/**
 * Debounced keystroke logging to avoid logging every single keystroke
 * Groups keystrokes within a time window
 */
let keystrokeBuffer = {
  input: 0,
  global: 0,
  lastFlush: Date.now(),
};

const KEYSTROKE_FLUSH_INTERVAL = 5000; // Flush every 5 seconds

function flushKeystrokeBuffer(): void {
  const now = Date.now();

  if (keystrokeBuffer.input > 0) {
    // Log batched input keystrokes (each keystroke = 10 pts)
    const inputPoints = keystrokeBuffer.input * ACTIVITY_POINTS[ActivityType.KEYSTROKE_INPUT];
    const entry: ActivityEntry = {
      id: generateActivityId(),
      type: ActivityType.KEYSTROKE_INPUT,
      points: inputPoints,
      timestamp: now,
      metadata: { keystrokeCount: keystrokeBuffer.input },
    };
    const state = addActivity(entry);
    notifyListeners(state);
  }

  if (keystrokeBuffer.global > 0) {
    // Log batched global keystrokes (each keystroke = 1 pt)
    const globalPoints = keystrokeBuffer.global * ACTIVITY_POINTS[ActivityType.KEYSTROKE_GLOBAL];
    const entry: ActivityEntry = {
      id: generateActivityId(),
      type: ActivityType.KEYSTROKE_GLOBAL,
      points: globalPoints,
      timestamp: now,
      metadata: { keystrokeCount: keystrokeBuffer.global },
    };
    const state = addActivity(entry);
    notifyListeners(state);
  }

  keystrokeBuffer = { input: 0, global: 0, lastFlush: now };
}

/**
 * Log a keystroke (batched for performance)
 *
 * @param isInputField - Whether the keystroke was in an input field
 */
export function logKeystroke(isInputField: boolean): void {
  if (isInputField) {
    keystrokeBuffer.input++;
  } else {
    keystrokeBuffer.global++;
  }

  // Check if we should flush
  const now = Date.now();
  if (now - keystrokeBuffer.lastFlush >= KEYSTROKE_FLUSH_INTERVAL) {
    flushKeystrokeBuffer();
  }
}

/**
 * Force flush keystroke buffer (call on window blur/close)
 */
export function flushKeystrokes(): void {
  flushKeystrokeBuffer();
}

// Passive time tracking
let passiveTrackingInterval: ReturnType<typeof setInterval> | null = null;
const PASSIVE_TRACKING_INTERVAL = 60000; // 1 minute

/**
 * Start passive time tracking
 * Logs 10 points per minute of active app usage
 */
export function startPassiveTracking(): void {
  if (passiveTrackingInterval) {
    return; // Already running
  }

  // Update last passive update to now
  setLastPassiveUpdate(Date.now());

  passiveTrackingInterval = setInterval(() => {
    const lastUpdate = getLastPassiveUpdate();
    const now = Date.now();
    const elapsedMinutes = Math.floor((now - lastUpdate) / 60000);

    if (elapsedMinutes >= 1) {
      const points = elapsedMinutes * ACTIVITY_POINTS[ActivityType.PASSIVE_TIME];
      const entry: ActivityEntry = {
        id: generateActivityId(),
        type: ActivityType.PASSIVE_TIME,
        points,
        timestamp: now,
        metadata: { minutes: elapsedMinutes },
      };
      const state = addActivity(entry);
      notifyListeners(state);
      setLastPassiveUpdate(now);
    }
  }, PASSIVE_TRACKING_INTERVAL);
}

/**
 * Stop passive time tracking
 */
export function stopPassiveTracking(): void {
  if (passiveTrackingInterval) {
    clearInterval(passiveTrackingInterval);
    passiveTrackingInterval = null;
  }
}

/**
 * Pause passive tracking (e.g., when window loses focus)
 */
export function pausePassiveTracking(): void {
  stopPassiveTracking();
  // Flush any pending keystrokes
  flushKeystrokeBuffer();
}

/**
 * Resume passive tracking (e.g., when window gains focus)
 */
export function resumePassiveTracking(): void {
  startPassiveTracking();
}

// Convenience functions for common activities

export function logEmailSent(metadata?: { subject?: string; recipients?: number }): ActivityEntry {
  return logActivity(ActivityType.EMAIL_SENT, metadata);
}

export function logMessageSent(metadata?: { channel?: string }): ActivityEntry {
  return logActivity(ActivityType.MESSAGE_SENT, metadata);
}

export function logDocumentShared(metadata?: { title?: string; url?: string }): ActivityEntry {
  return logActivity(ActivityType.DOCUMENT_SHARED, metadata);
}

export function logFileCreated(metadata?: { title?: string; type?: string }): ActivityEntry {
  return logActivity(ActivityType.FILE_CREATED, metadata);
}

export function logTaskCompleted(metadata?: { title?: string }): ActivityEntry {
  return logActivity(ActivityType.TASK_COMPLETED, metadata);
}

export function logInboxZero(): ActivityEntry {
  return logActivity(ActivityType.INBOX_ZERO);
}
