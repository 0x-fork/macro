/**
 * SolidJS reactive hooks for Activity Logger
 */

import { createSignal, onCleanup, onMount, createEffect, createMemo } from 'solid-js';
import type { ActivityState, DailySummary, ActivityEntry } from './types';
import { loadState, getTodaySummary, getHistory, getLifetimePoints } from './storage';
import {
  subscribeToActivity,
  startPassiveTracking,
  stopPassiveTracking,
  pausePassiveTracking,
  resumePassiveTracking,
  flushKeystrokes,
  logKeystroke,
} from './logger';

/**
 * Hook to get reactive activity state
 * Updates automatically when activities are logged
 */
export function useActivityState() {
  const [state, setState] = createSignal<ActivityState>(loadState());

  onMount(() => {
    // Subscribe to activity updates
    const unsubscribe = subscribeToActivity((newState) => {
      setState(newState);
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  return state;
}

/**
 * Hook to get today's summary with reactive updates
 */
export function useTodaySummary() {
  const state = useActivityState();
  return createMemo(() => state().today);
}

/**
 * Hook to get today's total points
 */
export function useTodayPoints() {
  const state = useActivityState();
  return createMemo(() => state().today.totalPoints);
}

/**
 * Hook to get lifetime points
 */
export function useLifetimePoints() {
  const state = useActivityState();
  return createMemo(() => state().lifetimePoints);
}

/**
 * Hook to get recent activities (last N)
 */
export function useRecentActivities(count: number = 20) {
  const state = useActivityState();
  return createMemo(() => {
    const activities = state().today.activities;
    return activities.slice(-count).reverse();
  });
}

/**
 * Hook to get historical data
 */
export function useActivityHistory() {
  const state = useActivityState();
  return createMemo(() => state().history);
}

/**
 * Hook to get points data for chart (last N days including today)
 */
export function usePointsChartData(days: number = 7) {
  const state = useActivityState();

  return createMemo(() => {
    const result: { date: string; points: number; label: string }[] = [];
    const today = state().today;
    const history = state().history;

    // Add today
    result.push({
      date: today.date,
      points: today.totalPoints,
      label: 'Today',
    });

    // Add history (already sorted most recent first)
    const dayLabels = ['Yesterday', '2 days ago', '3 days ago', '4 days ago', '5 days ago', '6 days ago'];
    for (let i = 0; i < Math.min(days - 1, history.length); i++) {
      result.push({
        date: history[i].date,
        points: history[i].totalPoints,
        label: dayLabels[i] || history[i].date,
      });
    }

    // Reverse so oldest is first (for chart display)
    return result.reverse();
  });
}

/**
 * Hook to initialize activity tracking (passive time, visibility handlers)
 * Call this once at app root
 */
export function useActivityTracking() {
  onMount(() => {
    // Start passive tracking
    startPassiveTracking();

    // Handle visibility changes
    const handleVisibilityChange = () => {
      if (document.hidden) {
        pausePassiveTracking();
      } else {
        resumePassiveTracking();
      }
    };

    // Handle window blur/focus
    const handleBlur = () => {
      pausePassiveTracking();
    };

    const handleFocus = () => {
      resumePassiveTracking();
    };

    // Handle beforeunload to flush pending data
    const handleBeforeUnload = () => {
      flushKeystrokes();
      stopPassiveTracking();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('beforeunload', handleBeforeUnload);

    onCleanup(() => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      stopPassiveTracking();
      flushKeystrokes();
    });
  });
}

/**
 * Hook to set up global keystroke tracking
 * Call this once at app root
 */
export function useKeystrokeTracking() {
  onMount(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys alone
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return;
      }

      // Check if target is an input field
      const target = e.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.getAttribute('role') === 'textbox';

      logKeystroke(isInputField);
    };

    document.addEventListener('keydown', handleKeyDown);

    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown);
    });
  });
}

/**
 * Combined hook for all tracking initialization
 * Use this at the app root for convenience
 */
export function useInitializeActivityLogger() {
  useActivityTracking();
  useKeystrokeTracking();
}
