import type { EmailContentStore, SyncState, ThreadDigest } from './store';
import {
  compareWatermarks,
  normalizeWatermark,
  overlappedSince,
} from './watermark';

/**
 * The slice of the store the engine drives — structural so tests can supply
 * an in-memory fake.
 */
export type ContentStorePort = Pick<
  EmailContentStore,
  | 'loadDigests'
  | 'getSyncState'
  | 'putSyncState'
  | 'recordPendingDigests'
  | 'completeHydration'
  | 'markHydrationFailed'
  | 'deleteThread'
  | 'evictLink'
  | 'markLinkPending'
  | 'prune'
>;

/**
 * The delta-sync engine behind the email content cache
 * (docs/email-content-cache.md). One instance runs per tab — the delta call
 * is cheap, concurrent hydrations across tabs are deduped by the store's
 * watermark compare-and-swap, and per-tab engines keep every tab's own
 * reactivity intact.
 *
 * The engine only ever writes L2 (the store); it never touches the TanStack
 * query cache. Open threads keep being refreshed by the existing
 * notification-driven invalidation; the engine's job is to make the *next*
 * open instant.
 *
 * All effects go through injected ports so the loop is testable with fakes
 * and reusable for other content types.
 */

export type DeltaDigestWire = {
  thread_id: string;
  link_id: string;
  watermark: string;
};

export type DeltaPage = {
  items: DeltaDigestWire[];
  next_cursor?: string | null;
};

export type HydrationResult =
  | {
      status: 'ok';
      /** Content in the exact shape the thread query caches. */
      data: unknown;
      hasDrafts: boolean;
      /** Approximate serialized bytes, for the store's byte budget. */
      size: number;
    }
  /** 404/410/403 — the thread is gone or unreadable; drop it. */
  | { status: 'gone' }
  | { status: 'error' };

export type EmailContentSyncPorts = {
  store: ContentStorePort;
  fetchDelta(args: {
    since: string;
    cursor?: string;
    order: 'asc' | 'desc';
    limit: number;
  }): Promise<DeltaPage | null>;
  fetchThread(threadId: string): Promise<HydrationResult>;
  /** Link ids the user can currently read; null when unknown (skip check). */
  fetchReadableLinkIds(): Promise<string[] | null>;
  now(): number;
  isVisible(): boolean;
};

export type EmailContentSyncConfig = {
  /** Re-served window absorbing commit-time skew (updated_at = tx start). */
  overlapMs: number;
  /** Trailing debounce for websocket wake-ups… */
  wakeDebounceMs: number;
  /** …with a max wait so a sustained event stream can't starve the sync. */
  wakeMaxWaitMs: number;
  /** Fallback tick while the tab is alive. */
  periodicMs: number;
  deltaPageLimit: number;
  maxDeltaPagesPerSync: number;
  maxHydrationsPerSync: number;
  bootstrapWindowMs: number;
  bootstrapMaxThreads: number;
  hydrationConcurrencyVisible: number;
  hydrationConcurrencyHidden: number;
  maxHydrationAttempts: number;
  /** Entries larger than this are not cached (hydrate fine from network). */
  maxEntryBytes: number;
  prune: { maxAgeMs: number; maxCount: number; maxBytes: number };
  pruneIntervalMs: number;
  /** How recent the last sync must be for a seed to count as fresh. */
  freshWindowMs: number;
  /** Random start delay bound, spreading fleet load. */
  startJitterMs: number;
  /** Threads re-hydrated after an untargeted delete event. */
  deleteSweepCount: number;
};

export const DEFAULT_SYNC_CONFIG: EmailContentSyncConfig = {
  overlapMs: 60_000,
  wakeDebounceMs: 2_000,
  wakeMaxWaitMs: 10_000,
  periodicMs: 10 * 60_000,
  deltaPageLimit: 500,
  maxDeltaPagesPerSync: 10,
  maxHydrationsPerSync: 50,
  bootstrapWindowMs: 30 * 24 * 60 * 60_000,
  bootstrapMaxThreads: 300,
  hydrationConcurrencyVisible: 2,
  hydrationConcurrencyHidden: 1,
  maxHydrationAttempts: 5,
  maxEntryBytes: 4 * 1024 * 1024,
  prune: {
    maxAgeMs: 7 * 24 * 60 * 60_000,
    maxCount: 1500,
    maxBytes: 50 * 1024 * 1024,
  },
  pruneIntervalMs: 60 * 60_000,
  freshWindowMs: 15 * 60_000,
  startJitterMs: 8_000,
  deleteSweepCount: 100,
};

export class EmailContentSyncEngine {
  /** In-memory mirror of the digests store, loaded once at start. */
  private digests = new Map<string, ThreadDigest>();
  private syncState: SyncState = {
    cursorWatermark: null,
    lastSyncAt: 0,
    bootstrappedAt: null,
  };

  private started = false;
  private syncing = false;
  private dirty = false;
  private backfillingLinks = new Set<string>();
  private queue: string[] = [];
  private queued = new Set<string>();
  private inFlight = new Set<string>();
  private hydrationsThisCycle = 0;

  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeDeadline: number | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private lastPruneAt = 0;

  constructor(
    private readonly ports: EmailContentSyncPorts,
    private readonly config: EmailContentSyncConfig = DEFAULT_SYNC_CONFIG
  ) {}

  /** Client ms of the last completed sync; drives seed freshness. */
  get lastSyncCompletedAt(): number {
    return this.syncState.lastSyncAt;
  }

  get isStarted(): boolean {
    return this.started;
  }

  getDigest(threadId: string): ThreadDigest | undefined {
    return this.digests.get(threadId);
  }

  /** Loads persisted state, drops unreadable links, resumes pending work. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.syncState = await this.ports.store.getSyncState();
    for (const digest of await this.ports.store.loadDigests()) {
      this.digests.set(digest.threadId, digest);
    }

    const readable = await this.ports.fetchReadableLinkIds();
    if (readable !== null) {
      const readableSet = new Set(readable);
      const stale = new Set<string>();
      for (const digest of this.digests.values()) {
        if (!readableSet.has(digest.linkId)) stale.add(digest.linkId);
      }
      for (const linkId of stale) await this.dropLink(linkId);
    }

    if (!this.started) return;

    for (const digest of this.digests.values()) {
      if (digest.state === 'pending') this.enqueue(digest.threadId);
    }

    this.periodicTimer = setInterval(() => {
      if (this.ports.isVisible()) this.wake('periodic');
    }, this.config.periodicMs);

    setTimeout(
      () => void this.runSync(),
      Math.random() * this.config.startJitterMs
    );
  }

  stop(): void {
    this.started = false;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeTimer = null;
    this.wakeDeadline = null;
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = null;
    this.queue = [];
    this.queued.clear();
    this.digests.clear();
    this.backfillingLinks.clear();
  }

  /**
   * Debounced sync trigger (trailing `wakeDebounceMs`, capped by
   * `wakeMaxWaitMs` so a sustained event stream still syncs).
   */
  wake(_reason: string): void {
    if (!this.started) return;
    const now = this.ports.now();
    this.wakeDeadline ??= now + this.config.wakeMaxWaitMs;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    const delay = Math.min(
      this.config.wakeDebounceMs,
      Math.max(0, this.wakeDeadline - now)
    );
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.wakeDeadline = null;
      void this.runSync();
    }, delay);
  }

  /** Targeted hydration (e.g. a websocket event that names the thread). */
  prioritizeThread(threadId: string, linkId: string): void {
    if (!this.started) return;
    // No digest yet: synthesize a pending one so guards and bookkeeping
    // exist; the next delta sync will supply the real watermark.
    if (!this.digests.has(threadId)) {
      void this.ports.store
        .recordPendingDigests(
          [{ threadId, linkId, watermark: normalizeWatermark(EPOCH) }],
          null,
          this.ports.now()
        )
        .then((recorded) => {
          for (const digest of recorded) {
            this.digests.set(digest.threadId, digest);
          }
        });
    }
    this.enqueue(threadId, 'front');
    void this.drainQueue();
  }

  /** A thread changed on the server; mark it pending and re-hydrate. */
  markThreadChanged(threadId: string, linkId: string): void {
    if (!this.started) return;
    const digest = this.digests.get(threadId);
    if (digest) {
      digest.state = 'pending';
      this.digests.set(threadId, digest);
    }
    this.prioritizeThread(threadId, linkId);
  }

  /** The server deleted this thread (targeted delete event). */
  async dropThread(threadId: string): Promise<void> {
    if (!this.started) return;
    this.digests.delete(threadId);
    await this.ports.store.deleteThread(threadId);
  }

  /**
   * A delete event that can't name its thread: nothing may be served as
   * fresh for this link until re-verified. The most recent threads are
   * re-hydrated eagerly; the rest heal on open (network path) or age out.
   */
  async onUntargetedDelete(linkId: string): Promise<void> {
    if (!this.started) return;
    const updated = await this.ports.store.markLinkPending(
      linkId,
      this.ports.now()
    );
    for (const digest of updated) this.digests.set(digest.threadId, digest);

    const recent = updated
      .sort((a, b) => compareWatermarks(b.watermark, a.watermark))
      .slice(0, this.config.deleteSweepCount);
    for (const digest of recent) this.enqueue(digest.threadId);
    void this.drainQueue();
  }

  async dropLink(linkId: string): Promise<void> {
    for (const [threadId, digest] of this.digests) {
      if (digest.linkId === linkId) this.digests.delete(threadId);
    }
    await this.ports.store.evictLink(linkId);
  }

  setBackfillActive(linkId: string, active: boolean): void {
    if (active) {
      this.backfillingLinks.add(linkId);
      return;
    }
    if (this.backfillingLinks.delete(linkId)) {
      // Backfill rewrote history with fresh updated_at values; re-run the
      // recency bootstrap instead of enumerating the whole rewrite.
      this.syncState = { ...this.syncState, bootstrappedAt: null };
      void this.ports.store.putSyncState(this.syncState);
      this.wake('backfill-complete');
    }
  }

  /**
   * One sync cycle. Single-flight: wake-ups landing mid-cycle set a dirty
   * flag that schedules exactly one follow-up.
   */
  private async runSync(): Promise<void> {
    if (!this.started) return;
    if (this.syncing) {
      this.dirty = true;
      return;
    }
    this.syncing = true;
    this.dirty = false;
    this.hydrationsThisCycle = 0;

    try {
      if (this.backfillingLinks.size === 0) {
        if (this.syncState.bootstrappedAt === null) {
          await this.bootstrap();
        } else {
          await this.incrementalSync();
        }
        await this.drainQueue();
        this.syncState = {
          ...(await this.ports.store.getSyncState()),
          lastSyncAt: this.ports.now(),
          bootstrappedAt: this.syncState.bootstrappedAt,
        };
        await this.ports.store.putSyncState(this.syncState);
        await this.maybePrune();
      }
    } catch (err) {
      console.error('[email-content-cache] sync failed', err);
    } finally {
      this.syncing = false;
    }

    if (this.dirty && this.started) this.wake('dirty');
  }

  /**
   * First run (or post-backfill): grab the most recently changed threads in
   * one descending page and start the cursor at the newest watermark.
   * Deeper history is deliberately not pre-cached.
   */
  private async bootstrap(): Promise<void> {
    const now = this.ports.now();
    const since = new Date(now - this.config.bootstrapWindowMs).toISOString();
    const page = await this.ports.fetchDelta({
      since,
      order: 'desc',
      limit: Math.min(this.config.bootstrapMaxThreads, 500),
    });
    if (!page) return;

    const digests = page.items.map((item) => ({
      threadId: item.thread_id,
      linkId: item.link_id,
      watermark: normalizeWatermark(item.watermark),
    }));

    const newest = digests.reduce<string | null>(
      (max, d) =>
        max === null || compareWatermarks(d.watermark, max) > 0
          ? d.watermark
          : max,
      null
    );

    const recorded = await this.ports.store.recordPendingDigests(
      digests,
      newest ?? normalizeWatermark(since),
      now
    );
    for (const digest of recorded) {
      this.digests.set(digest.threadId, digest);
      this.enqueue(digest.threadId);
    }

    this.syncState = {
      ...(await this.ports.store.getSyncState()),
      bootstrappedAt: now,
      lastSyncAt: this.syncState.lastSyncAt,
    };
    await this.ports.store.putSyncState(this.syncState);
  }

  private async incrementalSync(): Promise<void> {
    const stored = await this.ports.store.getSyncState();
    const cursorWatermark = stored.cursorWatermark;
    if (cursorWatermark === null) {
      // No cursor without a bootstrap should not happen; recover via
      // bootstrap rather than walking unbounded history.
      this.syncState = { ...stored, bootstrappedAt: null };
      return;
    }

    const since = overlappedSince(cursorWatermark, this.config.overlapMs);
    let pageCursor: string | undefined;

    for (let i = 0; i < this.config.maxDeltaPagesPerSync; i++) {
      const page = await this.ports.fetchDelta({
        since,
        cursor: pageCursor,
        order: 'asc',
        limit: this.config.deltaPageLimit,
      });
      if (!page) return;

      const now = this.ports.now();
      const accepted: {
        threadId: string;
        linkId: string;
        watermark: string;
      }[] = [];
      let pageMax: string | null = null;

      for (const item of page.items) {
        const watermark = normalizeWatermark(item.watermark);
        if (pageMax === null || compareWatermarks(watermark, pageMax) > 0) {
          pageMax = watermark;
        }
        if (this.shouldAccept(item.thread_id, watermark, now)) {
          accepted.push({
            threadId: item.thread_id,
            linkId: item.link_id,
            watermark,
          });
        }
      }

      const recorded = await this.ports.store.recordPendingDigests(
        accepted,
        pageMax,
        now
      );
      for (const digest of recorded) {
        this.digests.set(digest.threadId, digest);
        this.enqueue(digest.threadId);
      }

      if (!page.next_cursor) break;
      pageCursor = page.next_cursor;
    }
  }

  /**
   * The digest drop rule. Strictly older → drop. Strictly newer → accept.
   * Equal is subtle: `updated_at` is transaction *start* time, so a
   * transaction that committed after our hydration can carry a watermark
   * equal to one we already processed — equality proves nothing. Re-hydrate
   * unless our last hydration started comfortably after this watermark
   * value first appeared (then it already saw any late commit).
   */
  private shouldAccept(
    threadId: string,
    watermark: string,
    now: number
  ): boolean {
    const existing = this.digests.get(threadId);
    if (!existing) return true;

    const cmp = compareWatermarks(watermark, existing.watermark);
    if (cmp < 0) return false;
    if (cmp > 0) return true;

    if (existing.state === 'pending') return false; // already queued
    if (now - existing.seenAt > 2 * this.config.overlapMs) return false;
    return (
      existing.lastHydrationStartedAt < existing.seenAt + this.config.overlapMs
    );
  }

  private enqueue(threadId: string, position: 'front' | 'back' = 'back'): void {
    if (this.queued.has(threadId) || this.inFlight.has(threadId)) return;
    this.queued.add(threadId);
    if (position === 'front') this.queue.unshift(threadId);
    else this.queue.push(threadId);
  }

  private async drainQueue(): Promise<void> {
    if (!this.started) return;

    // Newest changes first — the user is most likely to open those.
    this.queue.sort((a, b) => {
      const wa = this.digests.get(a)?.watermark ?? '';
      const wb = this.digests.get(b)?.watermark ?? '';
      return compareWatermarks(wb, wa);
    });

    const concurrency = this.ports.isVisible()
      ? this.config.hydrationConcurrencyVisible
      : this.config.hydrationConcurrencyHidden;

    const workers: Promise<void>[] = [];
    for (let i = 0; i < concurrency; i++) {
      workers.push(this.hydrationWorker());
    }
    await Promise.all(workers);
  }

  private async hydrationWorker(): Promise<void> {
    while (this.started) {
      if (this.hydrationsThisCycle >= this.config.maxHydrationsPerSync) return;
      const threadId = this.queue.shift();
      if (threadId === undefined) return;
      this.queued.delete(threadId);

      const digest = this.digests.get(threadId);
      if (!digest || digest.state !== 'pending') continue;
      if (digest.attempts >= this.config.maxHydrationAttempts) continue;

      this.inFlight.add(threadId);
      this.hydrationsThisCycle++;
      try {
        await this.hydrateThread(digest);
      } finally {
        this.inFlight.delete(threadId);
      }
    }
  }

  private async hydrateThread(digest: ThreadDigest): Promise<void> {
    const startedAt = this.ports.now();
    const result = await this.ports.fetchThread(digest.threadId);

    if (result.status === 'gone') {
      this.digests.delete(digest.threadId);
      await this.ports.store.deleteThread(digest.threadId);
      return;
    }

    if (result.status === 'error') {
      const updated = await this.ports.store.markHydrationFailed(
        digest.threadId
      );
      if (updated) this.digests.set(digest.threadId, updated);
      return;
    }

    const tooLarge = result.size > this.config.maxEntryBytes;
    const updated = await this.ports.store.completeHydration({
      threadId: digest.threadId,
      linkId: digest.linkId,
      watermark: digest.watermark,
      startedAt,
      data: tooLarge ? undefined : result.data,
      hasDrafts: result.hasDrafts,
      size: result.size,
    });
    if (updated) {
      this.digests.set(digest.threadId, updated);
      if (updated.state === 'pending') this.enqueue(digest.threadId);
    }
  }

  private async maybePrune(): Promise<void> {
    const now = this.ports.now();
    if (now - this.lastPruneAt < this.config.pruneIntervalMs) return;
    this.lastPruneAt = now;
    const removed = await this.ports.store.prune({ ...this.config.prune, now });
    for (const threadId of removed) this.digests.delete(threadId);
  }
}

/** Sentinel watermark for synthesized digests (predates everything real). */
const EPOCH = '1970-01-01T00:00:00Z';
