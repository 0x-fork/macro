/**
 * Pure ranking logic for opportunistic prefetch: multiple signal sources
 * (frecency-sorted lists, inbox notifications, history) each contribute a
 * best-first list of entities; reciprocal-rank fusion merges them into one
 * prioritized, per-kind-capped prefetch plan. Rank-based fusion sidesteps
 * unit mismatches between sources (frecency scores vs timestamps vs unread
 * flags) — only each source's ordering matters.
 */

export type PrefetchEntityKind = 'channel' | 'emailThread' | 'document';

export type PrefetchEntityRef = Readonly<{
  kind: PrefetchEntityKind;
  id: string;
}>;

export type RankedPrefetchSource = Readonly<{
  /** Relative trust in this source's ordering (1 = baseline). */
  weight: number;
  /** Entity refs, best candidate first. */
  entries: readonly PrefetchEntityRef[];
}>;

export type PrefetchCandidate = PrefetchEntityRef & { score: number };

/** Flattens rank differences so appearing in multiple sources dominates. */
const RRF_RANK_OFFSET = 5;

/**
 * Merges ranked sources with reciprocal-rank fusion, then applies a per-kind
 * cap. Returns candidates ordered best-first across all kinds.
 */
export function fusePrefetchSources(
  sources: readonly RankedPrefetchSource[],
  limits: Readonly<Record<PrefetchEntityKind, number>>
): PrefetchCandidate[] {
  const byKey = new Map<string, PrefetchCandidate>();

  for (const source of sources) {
    source.entries.forEach((entry, rank) => {
      if (!entry.id) return;
      const key = `${entry.kind}:${entry.id}`;
      const score = source.weight / (RRF_RANK_OFFSET + rank);
      const existing = byKey.get(key);
      if (existing) existing.score += score;
      else byKey.set(key, { ...entry, score });
    });
  }

  const ranked = [...byKey.values()].sort((a, b) => b.score - a.score);

  const taken: Record<PrefetchEntityKind, number> = {
    channel: 0,
    emailThread: 0,
    document: 0,
  };
  return ranked.filter((candidate) => {
    if (taken[candidate.kind] >= limits[candidate.kind]) return false;
    taken[candidate.kind]++;
    return true;
  });
}

/** Sorts entries best-first by a numeric score accessor (higher = better). */
export function sortByScoreDesc<T>(
  items: readonly T[],
  score: (item: T) => number
): T[] {
  return [...items].sort((a, b) => score(b) - score(a));
}

/** Epoch millis for an ISO timestamp / Date, or 0 when absent/invalid. */
export function toEpochMillis(value: string | Date | null | undefined): number {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}
