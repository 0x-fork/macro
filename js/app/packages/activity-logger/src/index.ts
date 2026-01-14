/**
 * @macro/activity-logger
 *
 * A productivity tracking system that logs user activities and awards points.
 *
 * ## Quick Start
 *
 * ```typescript
 * // 1. Initialize tracking at app root
 * import { useInitializeActivityLogger } from '@macro/activity-logger';
 *
 * function App() {
 *   useInitializeActivityLogger();
 *   return <YourApp />;
 * }
 *
 * // 2. Log activities throughout the app
 * import { logEmailSent, logTaskCompleted, logActivity, ActivityType } from '@macro/activity-logger';
 *
 * // In email compose component
 * const handleSend = () => {
 *   sendEmail();
 *   logEmailSent({ subject: email.subject, recipients: email.to.length });
 * };
 *
 * // 3. Display points in UI
 * import { useTodayPoints, useRecentActivities } from '@macro/activity-logger';
 *
 * function PointsDisplay() {
 *   const points = useTodayPoints();
 *   return <div>Today: {points()} pts</div>;
 * }
 * ```
 *
 * ## Point Values
 *
 * - Email sent: 5000 pts
 * - Inbox zero: 10000 pts
 * - Message sent: 500 pts
 * - Document shared: 1000 pts
 * - File created: 100 pts
 * - Task completed: 10 pts
 * - Keystroke in input: 10 pts
 * - Keystroke anywhere: 1 pt
 * - Passive time: 10 pts/minute
 */

// Types
export {
  ActivityType,
  ACTIVITY_POINTS,
  ACTIVITY_LABELS,
  type ActivityTypeValue,
  type ActivityEntry,
  type DailySummary,
  type ActivityState,
  getTodayDate,
} from './types';

// Core logging functions
export {
  logActivity,
  logKeystroke,
  flushKeystrokes,
  logEmailSent,
  logMessageSent,
  logDocumentShared,
  logFileCreated,
  logTaskCompleted,
  logInboxZero,
  subscribeToActivity,
  startPassiveTracking,
  stopPassiveTracking,
  pausePassiveTracking,
  resumePassiveTracking,
} from './logger';

// Storage (for backend migration)
export {
  loadState,
  saveState,
  clearAllData,
  exportData,
  importData,
  getTodaySummary,
  getHistory,
  getTodayPoints,
  getLifetimePoints,
} from './storage';

// SolidJS hooks
export {
  useActivityState,
  useTodaySummary,
  useTodayPoints,
  useLifetimePoints,
  useRecentActivities,
  useActivityHistory,
  usePointsChartData,
  useActivityTracking,
  useKeystrokeTracking,
  useInitializeActivityLogger,
} from './hooks';
