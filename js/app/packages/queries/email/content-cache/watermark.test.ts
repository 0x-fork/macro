import { describe, expect, it } from 'vitest';
import {
  compareWatermarks,
  normalizeWatermark,
  overlappedSince,
} from './watermark';

describe('normalizeWatermark', () => {
  it('pads fractional seconds to a fixed width', () => {
    expect(normalizeWatermark('2026-07-03T12:00:00Z')).toBe(
      '2026-07-03T12:00:00.000000000Z'
    );
    expect(normalizeWatermark('2026-07-03T12:00:00.5Z')).toBe(
      '2026-07-03T12:00:00.500000000Z'
    );
    expect(normalizeWatermark('2026-07-03T12:00:00.123456Z')).toBe(
      '2026-07-03T12:00:00.123456000Z'
    );
  });

  it('truncates beyond nanoseconds', () => {
    expect(normalizeWatermark('2026-07-03T12:00:00.1234567891Z')).toBe(
      '2026-07-03T12:00:00.123456789Z'
    );
  });

  it('falls back to Date parsing for non-UTC shapes', () => {
    expect(normalizeWatermark('2026-07-03T12:00:00+02:00')).toBe(
      '2026-07-03T10:00:00.000000000Z'
    );
  });

  it('throws on garbage', () => {
    expect(() => normalizeWatermark('not a date')).toThrow();
  });
});

describe('compareWatermarks', () => {
  const n = normalizeWatermark;

  it('orders correctly across differing source precision', () => {
    // '.12' vs '.123': raw string comparison would order these wrong
    // ('Z' > '3'); normalization fixes it.
    expect(
      compareWatermarks(
        n('2026-07-03T12:00:00.12Z'),
        n('2026-07-03T12:00:00.123Z')
      )
    ).toBeLessThan(0);
    expect(
      compareWatermarks(
        n('2026-07-03T12:00:00.5Z'),
        n('2026-07-03T12:00:00.123456Z')
      )
    ).toBeGreaterThan(0);
  });

  it('preserves sub-millisecond distinctions Date would truncate', () => {
    const a = n('2026-07-03T12:00:00.123456Z');
    const b = n('2026-07-03T12:00:00.123789Z');
    expect(new Date(Date.parse('2026-07-03T12:00:00.123456Z')).getTime()).toBe(
      new Date(Date.parse('2026-07-03T12:00:00.123789Z')).getTime()
    );
    expect(compareWatermarks(a, b)).toBeLessThan(0);
  });

  it('treats identical instants as equal', () => {
    expect(
      compareWatermarks(
        n('2026-07-03T12:00:00Z'),
        n('2026-07-03T12:00:00.000Z')
      )
    ).toBe(0);
  });
});

describe('overlappedSince', () => {
  it('moves the bound earlier by the overlap', () => {
    const since = overlappedSince(
      normalizeWatermark('2026-07-03T12:01:00Z'),
      60_000
    );
    expect(Date.parse(since)).toBe(Date.parse('2026-07-03T12:00:00Z'));
  });

  it('only ever rounds down (never past the true instant)', () => {
    const since = overlappedSince(
      normalizeWatermark('2026-07-03T12:01:00.999999Z'),
      60_000
    );
    expect(Date.parse(since)).toBeLessThanOrEqual(
      Date.parse('2026-07-03T12:01:01Z') - 60_000
    );
  });
});
