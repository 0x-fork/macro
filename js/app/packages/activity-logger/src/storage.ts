/**
 * Activity Logger Storage
 *
 * This file contains ALL localStorage operations for the activity logger.
 * When migrating to a backend, replace the implementations in this file
 * to use API calls instead of localStorage.
 *
 * The interface should remain the same so other parts of the code don't need changes.
 */

import type { ActivityState, DailySummary, ActivityEntry, ActivityTypeValue } from './types';
import { getTodayDate } from './types';

const STORAGE_KEY = 'macro_activity_logger';
const MAX_HISTORY_DAYS = 30;

/**
 * Create an empty daily summary for a given date
 */
function createEmptyDailySummary(date: string): DailySummary {
  return {
    date,
    totalPoints: 0,
    activities: [],
    breakdown: {} as Record<ActivityTypeValue, { count: number; points: number }>,
  };
}

/**
 * Create initial empty state
 */
function createInitialState(): ActivityState {
  const today = getTodayDate();
  return {
    today: createEmptyDailySummary(today),
    history: [],
    lifetimePoints: 0,
    lastPassiveUpdate: Date.now(),
  };
}

/**
 * Load activity state from localStorage
 */
export function loadState(): ActivityState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return createInitialState();
    }

    const state: ActivityState = JSON.parse(stored);
    const today = getTodayDate();

    // Check if we need to roll over to a new day
    if (state.today.date !== today) {
      // Archive today's data to history
      if (state.today.totalPoints > 0 || state.today.activities.length > 0) {
        state.history.unshift(state.today);
        // Keep only MAX_HISTORY_DAYS in history
        if (state.history.length > MAX_HISTORY_DAYS) {
          state.history = state.history.slice(0, MAX_HISTORY_DAYS);
        }
      }
      // Start fresh for today
      state.today = createEmptyDailySummary(today);
      state.lastPassiveUpdate = Date.now();
      // Save the rolled-over state
      saveState(state);
    }

    return state;
  } catch (error) {
    console.error('[ActivityLogger] Error loading state:', error);
    return createInitialState();
  }
}

/**
 * Save activity state to localStorage
 */
export function saveState(state: ActivityState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('[ActivityLogger] Error saving state:', error);
  }
}

/**
 * Add an activity to today's log
 */
export function addActivity(entry: ActivityEntry): ActivityState {
  const state = loadState();

  // Add to today's activities
  state.today.activities.push(entry);
  state.today.totalPoints += entry.points;

  // Update breakdown
  if (!state.today.breakdown[entry.type]) {
    state.today.breakdown[entry.type] = { count: 0, points: 0 };
  }
  state.today.breakdown[entry.type].count += 1;
  state.today.breakdown[entry.type].points += entry.points;

  // Update lifetime points
  state.lifetimePoints += entry.points;

  saveState(state);
  return state;
}

/**
 * Get today's activity summary
 */
export function getTodaySummary(): DailySummary {
  return loadState().today;
}

/**
 * Get historical summaries
 */
export function getHistory(): DailySummary[] {
  return loadState().history;
}

/**
 * Get total points for today
 */
export function getTodayPoints(): number {
  return loadState().today.totalPoints;
}

/**
 * Get lifetime points
 */
export function getLifetimePoints(): number {
  return loadState().lifetimePoints;
}

/**
 * Get last passive update timestamp
 */
export function getLastPassiveUpdate(): number {
  return loadState().lastPassiveUpdate;
}

/**
 * Update last passive update timestamp
 */
export function setLastPassiveUpdate(timestamp: number): void {
  const state = loadState();
  state.lastPassiveUpdate = timestamp;
  saveState(state);
}

/**
 * Clear all activity data (useful for testing/debugging)
 */
export function clearAllData(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Export all data (for backup purposes)
 */
export function exportData(): ActivityState {
  return loadState();
}

/**
 * Import data (for restore purposes)
 */
export function importData(data: ActivityState): void {
  saveState(data);
}
