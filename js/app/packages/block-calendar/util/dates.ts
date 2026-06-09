/**
 * Thin date helpers for the calendar grid, built on `date-fns`.
 *
 * All persisted events store UTC epoch-millis (`startMs`/`endMs`); rendering
 * and editing happen in the browser's local timezone via the native `Date`.
 */
import {
  addDays,
  addWeeks,
  differenceInMinutes,
  eachDayOfInterval,
  endOfDay,
  endOfWeek,
  format,
  setHours,
  setMinutes,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import type { CalendarViewMode } from '../model/types';

const MINUTES_PER_DAY = 24 * 60;
/** Vertical pixels per hour in the time grid. */
export const HOUR_HEIGHT_PX = 48;
export const DAY_HEIGHT_PX = HOUR_HEIGHT_PX * 24;
/** Default new-event duration. */
export const DEFAULT_EVENT_MINUTES = 60;
/** Snap granularity (minutes) when clicking the grid. */
const SLOT_MINUTES = 30;

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Week starts on Sunday to match Google Calendar's default. */
const WEEK_OPTS = { weekStartsOn: 0 } as const;

/** The list of day-Dates visible for a given view + anchor date. */
export function daysForView(view: CalendarViewMode, anchor: Date): Date[] {
  switch (view) {
    case 'day':
      return [startOfDay(anchor)];
    case 'week':
      return eachDayOfInterval({
        start: startOfWeek(anchor, WEEK_OPTS),
        end: endOfWeek(anchor, WEEK_OPTS),
      });
    case 'list':
      // List shows a 30-day rolling window starting at the anchor day.
      return eachDayOfInterval({
        start: startOfDay(anchor),
        end: endOfDay(addDays(anchor, 29)),
      });
  }
}

/** Step the anchor forward/backward by one "screen" for the active view. */
export function shiftAnchor(
  view: CalendarViewMode,
  anchor: Date,
  direction: 1 | -1
): Date {
  switch (view) {
    case 'day':
      return addDays(anchor, direction);
    case 'week':
      return addWeeks(anchor, direction);
    case 'list':
      // Page the rolling window by its full length.
      return addDays(anchor, direction * 30);
  }
}

/** Minutes from local midnight for an instant. */
function minutesIntoDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** Pixel offset from the top of a day column for an instant. */
export function offsetTopPx(ms: number): number {
  return (minutesIntoDay(ms) / 60) * HOUR_HEIGHT_PX;
}

/** Pixel height for a duration, clamped to a minimum so short events stay legible. */
export function durationHeightPx(startMs: number, endMs: number): number {
  const mins = Math.max(differenceInMinutes(endMs, startMs), 1);
  return Math.max((mins / 60) * HOUR_HEIGHT_PX, 14);
}

/** Snap a click at `pixelY` within a `day` column to a slot-aligned instant. */
export function instantFromGridClick(day: Date, pixelY: number): number {
  const rawMinutes = (pixelY / HOUR_HEIGHT_PX) * 60;
  const snapped = Math.round(rawMinutes / SLOT_MINUTES) * SLOT_MINUTES;
  const clamped = Math.max(
    0,
    Math.min(snapped, MINUTES_PER_DAY - SLOT_MINUTES)
  );
  return setMinutes(setHours(startOfDay(day), 0), clamped).getTime();
}

/** True when the event's local-time span intersects the given local day. */
export function eventIntersectsDay(
  startMs: number,
  endMs: number,
  day: Date
): boolean {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = endOfDay(day).getTime();
  return startMs < dayEnd && endMs > dayStart;
}

// --- Formatting -----------------------------------------------------------

export function formatHourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

export function formatTimeRange(startMs: number, endMs: number): string {
  return `${format(startMs, 'h:mm a')} – ${format(endMs, 'h:mm a')}`;
}

export function formatViewTitle(view: CalendarViewMode, anchor: Date): string {
  switch (view) {
    case 'day':
      return format(anchor, 'EEEE, MMMM d, yyyy');
    case 'week': {
      const start = startOfWeek(anchor, WEEK_OPTS);
      const end = endOfWeek(anchor, WEEK_OPTS);
      if (start.getMonth() === end.getMonth()) {
        return `${format(start, 'MMMM yyyy')}`;
      }
      return `${format(start, 'MMM')} – ${format(end, 'MMM yyyy')}`;
    }
    case 'list':
      return `${format(anchor, 'MMM d')} – ${format(addDays(anchor, 29), 'MMM d, yyyy')}`;
  }
}

/** `datetime-local` input value (local time, no timezone suffix). */
export function toDatetimeLocalValue(ms: number): string {
  return format(ms, "yyyy-MM-dd'T'HH:mm");
}

/** Parse a `datetime-local` input value back into epoch-millis (local tz). */
export function fromDatetimeLocalValue(value: string): number {
  // `new Date('YYYY-MM-DDTHH:mm')` is interpreted as local time.
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}
