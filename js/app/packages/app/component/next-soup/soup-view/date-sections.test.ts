import { describe, expect, it } from 'vitest';
import {
  assignDateSections,
  dateSectionCutoffs,
  dateSectionGroupKey,
  isDateSectionGroupKey,
} from './date-sections';

// Fixed reference: Saturday 2026-07-04 15:30 local time.
const NOW = new Date(2026, 6, 4, 15, 30);
const CUTOFFS = dateSectionCutoffs(NOW);

const at = (
  year: number,
  month: number,
  day: number,
  hour = 12
): { ts: Date } => ({ ts: new Date(year, month, day, hour) });

const sectionsOf = (items: { ts: Date | string | null }[]) =>
  assignDateSections(items, (item) => item.ts, CUTOFFS);

describe('dateSectionCutoffs', () => {
  it('produces local start-of-day cutoffs for 0/1/6/29 days ago', () => {
    expect(CUTOFFS).toEqual([
      new Date(2026, 6, 4).getTime(),
      new Date(2026, 6, 3).getTime(),
      new Date(2026, 5, 28).getTime(),
      new Date(2026, 5, 5).getTime(),
    ]);
  });

  it('crosses month boundaries via calendar math', () => {
    const cutoffs = dateSectionCutoffs(new Date(2026, 2, 3, 9));
    expect(cutoffs[2]).toBe(new Date(2026, 1, 25).getTime());
    expect(cutoffs[3]).toBe(new Date(2026, 1, 2).getTime());
  });
});

describe('assignDateSections', () => {
  it('buckets a newest-first list at the section boundaries', () => {
    const sections = sectionsOf([
      at(2026, 6, 4, 15), // this afternoon
      at(2026, 6, 4, 0), // midnight today
      at(2026, 6, 3, 23), // yesterday evening
      at(2026, 6, 3, 0), // midnight yesterday
      at(2026, 6, 2, 12), // 2 days ago
      at(2026, 5, 28, 0), // 6 days ago, start of last-7 range
      at(2026, 5, 27, 23), // 7 days ago -> last 30
      at(2026, 5, 5, 0), // 29 days ago, start of last-30 range
      at(2026, 5, 4, 23), // 30 days ago -> earlier
      at(2025, 6, 4), // a year ago
    ]);
    expect(sections).toEqual([
      'today',
      'today',
      'yesterday',
      'yesterday',
      'last7',
      'last7',
      'last30',
      'last30',
      'earlier',
      'earlier',
    ]);
  });

  it('parses RFC3339 strings like entity timestamps', () => {
    const iso = new Date(2026, 6, 4, 9).toISOString();
    expect(sectionsOf([{ ts: iso }])).toEqual(['today']);
  });

  it('puts future timestamps in today', () => {
    expect(sectionsOf([at(2026, 6, 10)])).toEqual(['today']);
  });

  it('puts missing timestamps in earlier, matching their sort position', () => {
    expect(sectionsOf([{ ts: null }])).toEqual(['earlier']);
  });

  it('never reopens an earlier section for out-of-order timestamps', () => {
    const sections = sectionsOf([
      at(2026, 6, 3), // yesterday
      at(2026, 6, 4), // out-of-order today item stays in yesterday
      at(2025, 6, 4), // then the list moves on
    ]);
    expect(sections).toEqual(['yesterday', 'yesterday', 'earlier']);
  });

  it('handles an empty list', () => {
    expect(sectionsOf([])).toEqual([]);
  });
});

describe('dateSectionGroupKey', () => {
  it('round-trips through isDateSectionGroupKey', () => {
    expect(isDateSectionGroupKey(dateSectionGroupKey('today'))).toBe(true);
    expect(isDateSectionGroupKey('today')).toBe(false);
    expect(isDateSectionGroupKey('date')).toBe(false);
  });
});
