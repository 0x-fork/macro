import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ContentStorePort,
  DEFAULT_SYNC_CONFIG,
  type DeltaPage,
  EmailContentSyncEngine,
  type EmailContentSyncPorts,
  type HydrationResult,
} from './engine';
import { EMPTY_SYNC_STATE, type SyncState, type ThreadDigest } from './store';
import { normalizeWatermark } from './watermark';

const W1 = normalizeWatermark('2026-07-01T10:00:00Z');
const W2 = normalizeWatermark('2026-07-01T11:00:00Z');
const W3 = normalizeWatermark('2026-07-01T12:00:00Z');

/** In-memory stand-in for EmailContentStore with the same guard semantics. */
class FakeStore implements ContentStorePort {
  digests = new Map<string, ThreadDigest>();
  syncState: SyncState = { ...EMPTY_SYNC_STATE };
  deleted: string[] = [];

  async loadDigests() {
    return [...this.digests.values()];
  }
  async getSyncState() {
    return this.syncState;
  }
  async putSyncState(state: SyncState) {
    this.syncState = state;
  }
  async recordPendingDigests(
    incoming: readonly {
      threadId: string;
      linkId: string;
      watermark: string;
    }[],
    advanceCursorTo: string | null,
    now: number
  ) {
    const recorded: ThreadDigest[] = [];
    for (const d of incoming) {
      const existing = this.digests.get(d.threadId);
      if (existing && d.watermark < existing.watermark) continue;
      const advanced = !existing || d.watermark > existing.watermark;
      const digest: ThreadDigest = {
        threadId: d.threadId,
        linkId: d.linkId,
        watermark: d.watermark,
        state: 'pending',
        hasDrafts: existing?.hasDrafts ?? false,
        seenAt: advanced ? now : (existing?.seenAt ?? now),
        cachedAt: now,
        size: existing?.size ?? 0,
        attempts: advanced ? 0 : (existing?.attempts ?? 0),
        evictedAt: existing?.evictedAt ?? 0,
        lastHydrationStartedAt: existing?.lastHydrationStartedAt ?? 0,
      };
      this.digests.set(d.threadId, digest);
      recorded.push(digest);
    }
    if (
      advanceCursorTo !== null &&
      (this.syncState.cursorWatermark === null ||
        advanceCursorTo > this.syncState.cursorWatermark)
    ) {
      this.syncState = { ...this.syncState, cursorWatermark: advanceCursorTo };
    }
    return recorded;
  }
  async completeHydration(write: {
    threadId: string;
    linkId: string;
    watermark: string;
    startedAt: number;
    data: unknown;
    hasDrafts: boolean;
    size: number;
  }) {
    const existing = this.digests.get(write.threadId);
    if (!existing) return null;
    if (existing.evictedAt > write.startedAt) return null;
    const newerExists = existing.watermark > write.watermark;
    const digest: ThreadDigest = {
      threadId: write.threadId,
      linkId: write.linkId,
      watermark: newerExists ? existing.watermark : write.watermark,
      state: newerExists ? 'pending' : 'hydrated',
      hasDrafts: write.hasDrafts,
      seenAt: existing.seenAt,
      cachedAt: write.startedAt,
      size: write.size,
      attempts: 0,
      evictedAt: existing.evictedAt,
      lastHydrationStartedAt: write.startedAt,
    };
    this.digests.set(write.threadId, digest);
    return digest;
  }
  async markHydrationFailed(threadId: string) {
    const existing = this.digests.get(threadId);
    if (!existing) return null;
    const digest = { ...existing, attempts: existing.attempts + 1 };
    this.digests.set(threadId, digest);
    return digest;
  }
  async deleteThread(threadId: string) {
    this.digests.delete(threadId);
    this.deleted.push(threadId);
  }
  async evictLink(linkId: string) {
    for (const [id, d] of this.digests) {
      if (d.linkId === linkId) this.digests.delete(id);
    }
  }
  async markLinkPending(linkId: string, now: number) {
    const updated: ThreadDigest[] = [];
    for (const [id, d] of this.digests) {
      if (d.linkId !== linkId) continue;
      const next: ThreadDigest = {
        ...d,
        state: 'pending',
        cachedAt: now,
        evictedAt: now,
      };
      this.digests.set(id, next);
      updated.push(next);
    }
    return updated;
  }
  async prune() {
    return [];
  }
}

type Harness = {
  engine: EmailContentSyncEngine;
  store: FakeStore;
  deltaPages: DeltaPage[];
  deltaCalls: {
    since: string;
    cursor?: string;
    order: string;
    limit: number;
  }[];
  hydrations: string[];
  hydrationResults: Map<string, HydrationResult>;
};

function makeHarness(overrides?: {
  now?: () => number;
  config?: Partial<typeof DEFAULT_SYNC_CONFIG>;
}): Harness {
  const store = new FakeStore();
  const deltaPages: DeltaPage[] = [];
  const deltaCalls: Harness['deltaCalls'] = [];
  const hydrations: string[] = [];
  const hydrationResults = new Map<string, HydrationResult>();

  const ports: EmailContentSyncPorts = {
    store,
    async fetchDelta(args) {
      deltaCalls.push(args);
      return deltaPages.shift() ?? { items: [] };
    },
    async fetchThread(threadId) {
      hydrations.push(threadId);
      return (
        hydrationResults.get(threadId) ?? {
          status: 'ok',
          data: { pages: [{}], pageParams: [0] },
          hasDrafts: false,
          size: 100,
        }
      );
    },
    async fetchReadableLinkIds() {
      return null;
    },
    now: overrides?.now ?? (() => Date.now()),
    isVisible: () => true,
  };

  const engine = new EmailContentSyncEngine(ports, {
    ...DEFAULT_SYNC_CONFIG,
    startJitterMs: 0,
    wakeDebounceMs: 1,
    wakeMaxWaitMs: 5,
    ...overrides?.config,
  });

  return {
    engine,
    store,
    deltaPages,
    deltaCalls,
    hydrations,
    hydrationResults,
  };
}

async function flush() {
  // Drain timers + microtasks: the engine schedules its first sync with a
  // (zero-jitter) timeout and hydrations chain promises.
  for (let i = 0; i < 20; i++) {
    await vi.advanceTimersByTimeAsync(10);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
});

describe('bootstrap', () => {
  it('records the newest digests, hydrates them, and sets the cursor', async () => {
    const h = makeHarness();
    h.deltaPages.push({
      items: [
        { thread_id: 't3', link_id: 'l1', watermark: W3 },
        { thread_id: 't2', link_id: 'l1', watermark: W2 },
      ],
    });

    await h.engine.start();
    await flush();

    expect(h.deltaCalls[0]?.order).toBe('desc');
    expect(h.hydrations).toEqual(['t3', 't2']); // newest first
    expect(h.store.syncState.cursorWatermark).toBe(W3);
    expect(h.store.syncState.bootstrappedAt).not.toBeNull();
    expect(h.store.digests.get('t3')?.state).toBe('hydrated');
  });
});

describe('incremental sync', () => {
  async function bootstrapped(h: Harness) {
    h.deltaPages.push({ items: [] });
    await h.engine.start();
    await flush();
    // Give the empty bootstrap a cursor to resume from.
    h.store.syncState = {
      ...h.store.syncState,
      cursorWatermark: W1,
      bootstrappedAt: 1,
    };
  }

  it('drops strictly older digests and hydrates newer ones', async () => {
    const h = makeHarness();
    await bootstrapped(h);

    h.store.digests.set('t1', {
      threadId: 't1',
      linkId: 'l1',
      watermark: W2,
      state: 'hydrated',
      hasDrafts: false,
      seenAt: 0,
      cachedAt: 0,
      size: 10,
      attempts: 0,
      evictedAt: 0,
      lastHydrationStartedAt: 0,
    });

    h.deltaPages.push({
      items: [
        { thread_id: 't1', link_id: 'l1', watermark: W1 }, // older → dropped
        { thread_id: 't9', link_id: 'l1', watermark: W3 }, // new → hydrated
      ],
    });

    h.engine.wake('test');
    await flush();

    expect(h.hydrations).toEqual(['t9']);
    expect(h.store.digests.get('t1')?.watermark).toBe(W2);
  });

  it('re-hydrates an equal watermark only while the overlap window is live', async () => {
    const nowMs = 1_000_000;
    const h = makeHarness({ now: () => nowMs });

    // Pre-seeded before start so the engine loads them into memory.
    // t1: hydrated long ago; watermark equal; overlap long expired → skip.
    h.store.digests.set('t1', {
      threadId: 't1',
      linkId: 'l1',
      watermark: W2,
      state: 'hydrated',
      hasDrafts: false,
      seenAt: nowMs - 10 * 60_000,
      cachedAt: 0,
      size: 10,
      attempts: 0,
      evictedAt: 0,
      lastHydrationStartedAt: nowMs - 10 * 60_000,
    });
    // t2: equal watermark, but first seen moments ago and hydrated
    // immediately after — a late-committing transaction could still be
    // invisible, so it must re-hydrate.
    h.store.digests.set('t2', {
      threadId: 't2',
      linkId: 'l1',
      watermark: W2,
      state: 'hydrated',
      hasDrafts: false,
      seenAt: nowMs - 5_000,
      cachedAt: 0,
      size: 10,
      attempts: 0,
      evictedAt: 0,
      lastHydrationStartedAt: nowMs - 4_000,
    });
    h.store.syncState = {
      cursorWatermark: W1,
      lastSyncAt: 0,
      bootstrappedAt: 1,
    };
    h.deltaPages.push({
      items: [
        { thread_id: 't1', link_id: 'l1', watermark: W2 },
        { thread_id: 't2', link_id: 'l1', watermark: W2 },
      ],
    });

    await h.engine.start();
    await flush();

    expect(h.hydrations).toEqual(['t2']);
  });

  it('walks next_cursor pages within one sync', async () => {
    const h = makeHarness();
    await bootstrapped(h);

    h.deltaPages.push(
      {
        items: [{ thread_id: 'a', link_id: 'l1', watermark: W2 }],
        next_cursor: 'cursor-1',
      },
      { items: [{ thread_id: 'b', link_id: 'l1', watermark: W3 }] }
    );

    h.engine.wake('test');
    await flush();

    expect(h.deltaCalls.length).toBe(3); // bootstrap + 2 incremental pages
    expect(h.deltaCalls[2]?.cursor).toBe('cursor-1');
    expect(new Set(h.hydrations)).toEqual(new Set(['a', 'b']));
    expect(h.store.syncState.cursorWatermark).toBe(W3);
  });
});

describe('hydration outcomes', () => {
  it('drops the thread entirely when the server says gone', async () => {
    const h = makeHarness();
    h.deltaPages.push({
      items: [{ thread_id: 't1', link_id: 'l1', watermark: W1 }],
    });
    h.hydrationResults.set('t1', { status: 'gone' });

    await h.engine.start();
    await flush();

    expect(h.store.deleted).toEqual(['t1']);
    expect(h.engine.getDigest('t1')).toBeUndefined();
  });

  it('leaves failed hydrations pending and stops after max attempts', async () => {
    const h = makeHarness({ config: { maxHydrationAttempts: 2 } });
    h.deltaPages.push({
      items: [{ thread_id: 't1', link_id: 'l1', watermark: W1 }],
    });
    h.hydrationResults.set('t1', { status: 'error' });

    await h.engine.start();
    await flush();
    expect(h.store.digests.get('t1')?.state).toBe('pending');
    expect(h.store.digests.get('t1')?.attempts).toBe(1);

    // Next wakes retry until the attempt cap, then stop.
    h.deltaPages.push({ items: [] });
    h.engine.markThreadChanged('t1');
    await flush();
    expect(h.store.digests.get('t1')?.attempts).toBe(2);

    h.deltaPages.push({ items: [] });
    h.engine.markThreadChanged('t1');
    await flush();
    expect(h.store.digests.get('t1')?.attempts).toBe(2);
  });
});

describe('events', () => {
  it('marks a changed thread pending and hydrates it once via the sync', async () => {
    const h = makeHarness();
    // Pre-seeded before start so the engine loads it into memory.
    h.store.digests.set('t1', {
      threadId: 't1',
      linkId: 'l1',
      watermark: W1,
      state: 'hydrated',
      hasDrafts: false,
      seenAt: 0,
      cachedAt: 0,
      size: 10,
      attempts: 0,
      evictedAt: 0,
      lastHydrationStartedAt: 0,
    });
    h.store.syncState = {
      cursorWatermark: W1,
      lastSyncAt: 0,
      bootstrappedAt: 1,
    };
    h.deltaPages.push({ items: [] });
    await h.engine.start();
    await flush();
    expect(h.hydrations).toEqual([]);

    // The event marks it pending; the woken sync supplies the new watermark
    // and exactly one hydration happens.
    h.deltaPages.push({
      items: [{ thread_id: 't1', link_id: 'l1', watermark: W2 }],
    });
    h.engine.markThreadChanged('t1');
    expect(h.engine.getDigest('t1')?.state).toBe('pending');
    await flush();

    expect(h.hydrations).toEqual(['t1']);
    expect(h.store.digests.get('t1')?.state).toBe('hydrated');
    expect(h.store.digests.get('t1')?.watermark).toBe(W2);
  });

  it('untargeted deletes downgrade the link and re-verify recent threads', async () => {
    const h = makeHarness({ config: { deleteSweepCount: 1 } });
    h.deltaPages.push({
      items: [
        { thread_id: 't1', link_id: 'l1', watermark: W1 },
        { thread_id: 't2', link_id: 'l1', watermark: W2 },
      ],
    });
    await h.engine.start();
    await flush();
    expect(h.store.digests.get('t1')?.state).toBe('hydrated');

    h.deltaPages.push({ items: [] });
    await h.engine.onUntargetedDelete('l1');
    await flush();

    // Only the most recent thread is re-verified eagerly…
    expect(h.hydrations.filter((t) => t === 't2').length).toBe(2);
    expect(h.store.digests.get('t2')?.state).toBe('hydrated');
    // …the other stays pending (never served-as-fresh) until it heals.
    expect(h.store.digests.get('t1')?.state).toBe('pending');
  });

  it('pauses while a backfill is active and re-bootstraps after', async () => {
    const h = makeHarness();
    h.deltaPages.push({ items: [] });
    await h.engine.start();
    await flush();
    const callsAfterStart = h.deltaCalls.length;

    h.engine.setBackfillActive('l1', true);
    h.engine.wake('event');
    await flush();
    expect(h.deltaCalls.length).toBe(callsAfterStart); // paused

    h.deltaPages.push({ items: [] });
    h.engine.setBackfillActive('l1', false);
    await flush();
    expect(h.deltaCalls.at(-1)?.order).toBe('desc'); // re-bootstrap
  });
});
