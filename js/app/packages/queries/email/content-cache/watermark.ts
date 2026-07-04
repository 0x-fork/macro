/**
 * Watermarks are server-minted RFC3339 timestamps with up to nanosecond
 * precision (Postgres emits microseconds). They are stored and compared as
 * normalized strings: `Date` parsing truncates to milliseconds, which would
 * make two distinct same-millisecond watermarks compare equal and silently
 * drop the newer change.
 */

const RFC3339_UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/;

/** Fixed fractional width every normalized watermark carries. */
const FRACTION_DIGITS = 9;

/**
 * Normalizes an RFC3339 UTC timestamp to a fixed-width form
 * (`YYYY-MM-DDTHH:MM:SS.nnnnnnnnnZ`) so plain string comparison orders
 * correctly across differing fractional precision. Non-UTC or unexpected
 * shapes fall back to millisecond precision via `Date` (defensive; the
 * backend always serializes UTC).
 */
export function normalizeWatermark(timestamp: string): string {
  const match = RFC3339_UTC.exec(timestamp);
  if (match) {
    const fraction = (match[2] ?? '')
      .padEnd(FRACTION_DIGITS, '0')
      .slice(0, FRACTION_DIGITS);
    return `${match[1]}.${fraction}Z`;
  }

  const ms = Date.parse(timestamp);
  if (Number.isNaN(ms)) {
    throw new Error(`Unparseable watermark: ${timestamp}`);
  }
  return normalizeWatermark(new Date(ms).toISOString());
}

/**
 * Compares two normalized watermarks. Returns a negative number when `a` is
 * older, positive when newer, 0 when identical.
 */
export function compareWatermarks(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The `since` value for the next delta request: the given watermark minus an
 * overlap window. `updated_at` is transaction *start* time, so a transaction
 * can commit with a watermark older than one we already processed — the
 * overlap re-serves that boundary and processing is idempotent. Millisecond
 * truncation here only ever moves the bound earlier, which is safe.
 */
export function overlappedSince(watermark: string, overlapMs: number): string {
  return new Date(Date.parse(watermark) - overlapMs).toISOString();
}
