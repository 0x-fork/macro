import type { DateValue } from '@core/util/date';
import type { EntityData } from '@entity';
import { createSignal } from 'solid-js';

/**
 * Superhuman-style date sections for flat (ungrouped) soup lists: Today,
 * Yesterday, Last 7 days, Last 30 days, Earlier. Sections are derived
 * client-side from the timestamps the list is already sorted by, so they
 * work on cached/persisted pages with zero extra queries — unlike server
 * `groupBy`, which is a different query pipeline (and different buckets).
 */
export type DateSectionKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'earlier';

const SECTION_ORDER: readonly DateSectionKey[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'earlier',
];

export const DATE_SECTION_LABELS: Record<DateSectionKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  earlier: 'Earlier',
};

const GROUP_KEY_PREFIX = 'date-section:';

export const dateSectionGroupKey = (key: DateSectionKey): string =>
  `${GROUP_KEY_PREFIX}${key}`;

export const isDateSectionGroupKey = (key: string): boolean =>
  key.startsWith(GROUP_KEY_PREFIX);

/**
 * Start-of-day cutoffs, newest first, aligned with SECTION_ORDER: a
 * timestamp belongs to the first cutoff it reaches, and to 'earlier' when
 * it reaches none. Local calendar days via Date field math (DST-safe;
 * subtracting 86400000s would drift across DST transitions).
 */
export type DateSectionCutoffs = readonly [number, number, number, number];

export function dateSectionCutoffs(now: Date = new Date()): DateSectionCutoffs {
  const startOfDaysAgo = (days: number) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - days).getTime();
  return [
    startOfDaysAgo(0), // today
    startOfDaysAgo(1), // yesterday
    startOfDaysAgo(6), // last 7 calendar days
    startOfDaysAgo(29), // last 30 calendar days
  ];
}

function sectionIndexFor(
  ts: DateValue | null | undefined,
  cutoffs: DateSectionCutoffs
): number {
  const ms =
    ts == null
      ? Number.NaN
      : ts instanceof Date
        ? ts.getTime()
        : Date.parse(ts);
  // Missing timestamps sort to the end of the list (epoch-zero fallback in
  // the sort comparators), so 'earlier' keeps sections contiguous.
  if (Number.isNaN(ms)) return SECTION_ORDER.length - 1;
  for (let i = 0; i < cutoffs.length; i++) {
    if (ms >= cutoffs[i]!) return i;
  }
  return SECTION_ORDER.length - 1;
}

/**
 * Assigns each item of a newest-first list to a date section in one pass.
 * Sections only move forward (Today → … → Earlier): an out-of-order
 * timestamp is clamped into the current section rather than re-opening an
 * earlier one, so each header appears at most once and row ids stay unique.
 */
export function assignDateSections<T>(
  items: readonly T[],
  timestampOf: (item: T) => DateValue | null | undefined,
  cutoffs: DateSectionCutoffs
): DateSectionKey[] {
  const result: DateSectionKey[] = new Array(items.length);
  let floor = 0;
  for (let i = 0; i < items.length; i++) {
    floor = Math.max(floor, sectionIndexFor(timestampOf(items[i]!), cutoffs));
    result[i] = SECTION_ORDER[floor]!;
  }
  return result;
}

/**
 * Timestamp accessors matching the sort comparators in sort-options.tsx,
 * keyed by sort id. Sections must bucket on the exact field the list is
 * sorted by or headers would interleave. Sort ids without a date accessor
 * (priority, status) get no sections.
 */
export const DATE_SECTION_SORT_TIMESTAMPS: Record<
  string,
  ((entity: EntityData) => DateValue | null | undefined) | undefined
> = {
  updated_at: (entity) => entity.sortTs ?? entity.updatedAt,
  viewed_at: (entity) => entity.sortTs ?? entity.viewedAt,
  created_at: (entity) => entity.sortTs ?? entity.createdAt,
};

const [sectionDayTick, setSectionDayTick] = createSignal(0);
let midnightTimerArmed = false;

function armMidnightTimer(): void {
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  ).getTime();
  // +1s lands safely past the boundary; re-arms itself for the next day.
  setTimeout(
    () => {
      setSectionDayTick((t) => t + 1);
      armMidnightTimer();
    },
    Math.max(1_000, nextMidnight - now.getTime() + 1_000)
  );
}

/**
 * Reactive tick that increments when the local calendar day rolls over, so
 * a memo deriving date sections re-buckets at midnight ("Today" becomes
 * "Yesterday") without polling. One lazily-armed timer app-wide.
 */
export function dateSectionDayTick(): number {
  if (!midnightTimerArmed) {
    midnightTimerArmed = true;
    armMidnightTimer();
  }
  return sectionDayTick();
}
