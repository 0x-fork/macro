import { type DBSchema, type IDBPDatabase, openDB as idbOpen } from 'idb';
import { compareWatermarks } from './watermark';

/**
 * The durable (L2) side of the email content cache
 * (docs/email-content-cache.md). Three object stores:
 *
 * - `threads`: cached thread content in the exact shape the thread query
 *   caches, so seeding the query cache is a verbatim `setQueryData`.
 * - `digests`: per-thread sync bookkeeping — the server watermark, the
 *   pending/hydrated state, and the guards below.
 * - `sync`: singleton rows — the delta cursor and the store identity.
 *
 * Unlike the generic per-query persistence layer, nothing here is coupled to
 * TanStack GC; retention is bounded by `prune`.
 *
 * Every content write is a guarded compare-and-swap inside one transaction
 * spanning `threads` + `digests` + `sync`:
 * - the store generation must match the one loaded at `open` (a user switch
 *   wipes and bumps it, so an in-flight hydration from the previous user can
 *   never land),
 * - the thread's eviction epoch must predate the hydration start (a draft
 *   save mid-hydration can't be resurrected by the older response),
 * - the incoming watermark must not be older than the stored one.
 */

export const EMAIL_CONTENT_CACHE_DB = 'email-content-cache-v1';
const DB_VERSION = 1;

const THREADS = 'threads';
const DIGESTS = 'digests';
const SYNC = 'sync';

const IDENTITY_KEY = 'identity';
const SYNC_STATE_KEY = 'state';

/** Cached content for one thread. `data` is opaque to the store. */
export type CachedThreadEntry = {
  threadId: string;
  /** The thread query's cached value, verbatim (`InfiniteData<ApiThread>`). */
  data: unknown;
  /** Client ms timestamp of the hydration that produced `data`. */
  hydratedAt: number;
};

export type ThreadDigest = {
  threadId: string;
  linkId: string;
  /** Normalized server watermark (see watermark.ts). */
  watermark: string;
  /** `pending` = a change is known but content not (re-)fetched yet. */
  state: 'pending' | 'hydrated';
  /** Threads containing drafts are never served from cache. */
  hasDrafts: boolean;
  /** Client ms when this watermark value was first recorded. */
  seenAt: number;
  /** Client ms of the last digest/content update (prune key). */
  cachedAt: number;
  /** Approximate serialized bytes of the cached entry (0 while pending). */
  size: number;
  /** Failed hydration attempts for the current watermark. */
  attempts: number;
  /** Client ms eviction epoch; hydrations started before it must not land. */
  evictedAt: number;
  /** Client ms when the last successful hydration started. */
  lastHydrationStartedAt: number;
};

export type SyncState = {
  /** Highest watermark whose digests are durably recorded. */
  cursorWatermark: string | null;
  /** Client ms of the last completed delta sync. */
  lastSyncAt: number;
  /** Client ms of the completed bootstrap, or null before it. */
  bootstrappedAt: number | null;
};

type Identity = { userId: string; generation: number };

interface Schema extends DBSchema {
  threads: { key: string; value: CachedThreadEntry };
  digests: {
    key: string;
    value: ThreadDigest;
    indexes: { linkId: string };
  };
  sync: {
    key: string;
    value:
      | { key: string; identity: Identity }
      | { key: string; state: SyncState };
  };
}

export const EMPTY_SYNC_STATE: SyncState = {
  cursorWatermark: null,
  lastSyncAt: 0,
  bootstrappedAt: null,
};

export type HydrationWrite = {
  threadId: string;
  linkId: string;
  /** Normalized watermark of the digest this hydration answered. */
  watermark: string;
  /** Client ms when the hydration fetch started (eviction-epoch guard). */
  startedAt: number;
  /** Cached content; `undefined` marks the digest hydrated without content
   * (e.g. the thread was too large to cache). */
  data: unknown | undefined;
  hasDrafts: boolean;
  size: number;
};

export class EmailContentStore {
  private db: IDBPDatabase<Schema> | null = null;
  private generation = 0;

  /**
   * Opens the database and validates identity: a different user (or a
   * missing identity row) wipes all content and bumps the generation.
   */
  async open(userId: string): Promise<void> {
    const db = await idbOpen<Schema>(EMAIL_CONTENT_CACHE_DB, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore(THREADS, { keyPath: 'threadId' });
        const digests = db.createObjectStore(DIGESTS, { keyPath: 'threadId' });
        digests.createIndex('linkId', 'linkId');
        db.createObjectStore(SYNC, { keyPath: 'key' });
      },
    });

    const tx = db.transaction([THREADS, DIGESTS, SYNC], 'readwrite');
    const syncStore = tx.objectStore(SYNC);
    const identityRow = (await syncStore.get(IDENTITY_KEY)) as
      | { key: string; identity: Identity }
      | undefined;

    let identity = identityRow?.identity;
    if (!identity || identity.userId !== userId) {
      await tx.objectStore(THREADS).clear();
      await tx.objectStore(DIGESTS).clear();
      await syncStore.clear();
      identity = { userId, generation: (identity?.generation ?? 0) + 1 };
      await syncStore.put({ key: IDENTITY_KEY, identity });
    }
    await tx.done;

    this.db = db;
    this.generation = identity.generation;
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }

  private requireDb(): IDBPDatabase<Schema> {
    const db = this.db;
    if (!db) throw new Error('EmailContentStore used before open()');
    return db;
  }

  /** Re-reads the identity inside `tx` and compares to the open-time one. */
  private async generationValid(
    tx: { objectStore(name: 'sync'): { get(key: string): Promise<unknown> } },
    expected: number
  ): Promise<boolean> {
    const row = (await tx.objectStore(SYNC).get(IDENTITY_KEY)) as
      | { key: string; identity: Identity }
      | undefined;
    return row?.identity.generation === expected;
  }

  async loadDigests(): Promise<ThreadDigest[]> {
    return await this.requireDb().getAll(DIGESTS);
  }

  async getEntry(threadId: string): Promise<CachedThreadEntry | undefined> {
    return await this.requireDb().get(THREADS, threadId);
  }

  async getSyncState(): Promise<SyncState> {
    const row = (await this.requireDb().get(SYNC, SYNC_STATE_KEY)) as
      | { key: string; state: SyncState }
      | undefined;
    return row?.state ?? EMPTY_SYNC_STATE;
  }

  async putSyncState(state: SyncState): Promise<void> {
    await this.requireDb().put(SYNC, { key: SYNC_STATE_KEY, state });
  }

  /**
   * Records a page of delta digests as `pending` and advances the cursor in
   * the same transaction — a crash never strands a digest beyond the cursor.
   * Digests strictly older than the stored watermark are dropped. Returns
   * the digests that were actually recorded (the engine's hydration
   * work-list) with their updated bookkeeping.
   */
  async recordPendingDigests(
    incoming: readonly {
      threadId: string;
      linkId: string;
      watermark: string;
    }[],
    advanceCursorTo: string | null,
    now: number
  ): Promise<ThreadDigest[]> {
    const db = this.requireDb();
    const tx = db.transaction([DIGESTS, SYNC], 'readwrite');
    if (!(await this.generationValid(tx, this.generation))) {
      await tx.done;
      return [];
    }

    const digests = tx.objectStore(DIGESTS);
    const recorded: ThreadDigest[] = [];

    for (const d of incoming) {
      const existing = await digests.get(d.threadId);
      if (existing && compareWatermarks(d.watermark, existing.watermark) < 0) {
        continue;
      }

      const advanced =
        !existing || compareWatermarks(d.watermark, existing.watermark) > 0;
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
      await digests.put(digest);
      recorded.push(digest);
    }

    if (advanceCursorTo !== null) {
      const syncStore = tx.objectStore(SYNC);
      const row = (await syncStore.get(SYNC_STATE_KEY)) as
        | { key: string; state: SyncState }
        | undefined;
      const state = row?.state ?? EMPTY_SYNC_STATE;
      if (
        state.cursorWatermark === null ||
        compareWatermarks(advanceCursorTo, state.cursorWatermark) > 0
      ) {
        await syncStore.put({
          key: SYNC_STATE_KEY,
          state: { ...state, cursorWatermark: advanceCursorTo },
        });
      }
    }

    await tx.done;
    return recorded;
  }

  /**
   * Lands a hydration. Returns the updated digest, or `null` when the write
   * was rejected by a guard (generation change, eviction epoch, or a newer
   * stored watermark with the digest left pending for a re-fetch).
   */
  async completeHydration(write: HydrationWrite): Promise<ThreadDigest | null> {
    const db = this.requireDb();
    const tx = db.transaction([THREADS, DIGESTS, SYNC], 'readwrite');
    if (!(await this.generationValid(tx, this.generation))) {
      await tx.done;
      return null;
    }

    const digests = tx.objectStore(DIGESTS);
    const existing = await digests.get(write.threadId);

    // Evicted after this hydration started (e.g. a draft save): the response
    // predates the eviction, so it must not land.
    if (existing && existing.evictedAt > write.startedAt) {
      await tx.done;
      return null;
    }

    // A newer digest arrived while we fetched. The content is still the
    // freshest we have, so store it, but leave the digest pending at the
    // newer watermark so it re-hydrates.
    const newerExists =
      existing && compareWatermarks(existing.watermark, write.watermark) > 0;

    const digest: ThreadDigest = {
      threadId: write.threadId,
      linkId: write.linkId,
      watermark: newerExists ? existing.watermark : write.watermark,
      state: newerExists ? 'pending' : 'hydrated',
      hasDrafts: write.hasDrafts,
      seenAt: existing?.seenAt ?? write.startedAt,
      cachedAt: Date.now(),
      size: write.data === undefined ? 0 : write.size,
      attempts: 0,
      evictedAt: existing?.evictedAt ?? 0,
      lastHydrationStartedAt: write.startedAt,
    };
    await digests.put(digest);

    if (write.data === undefined) {
      await tx.objectStore(THREADS).delete(write.threadId);
    } else {
      await tx.objectStore(THREADS).put({
        threadId: write.threadId,
        data: write.data,
        hydratedAt: Date.now(),
      });
    }

    await tx.done;
    return digest;
  }

  /** Bumps the failed-attempt counter for a pending digest. */
  async markHydrationFailed(threadId: string): Promise<ThreadDigest | null> {
    const db = this.requireDb();
    const tx = db.transaction(DIGESTS, 'readwrite');
    const existing = await tx.store.get(threadId);
    if (!existing) {
      await tx.done;
      return null;
    }
    const digest = { ...existing, attempts: existing.attempts + 1 };
    await tx.store.put(digest);
    await tx.done;
    return digest;
  }

  /**
   * Mutation-driven eviction: drops the content and bumps the eviction
   * epoch so an in-flight hydration that started earlier cannot resurrect
   * the pre-mutation snapshot. The digest survives as `pending`.
   */
  async evictThread(threadId: string, now: number): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction([THREADS, DIGESTS], 'readwrite');
    await tx.objectStore(THREADS).delete(threadId);
    const digests = tx.objectStore(DIGESTS);
    const existing = await digests.get(threadId);
    if (existing) {
      await digests.put({
        ...existing,
        state: 'pending',
        size: 0,
        cachedAt: now,
        evictedAt: now,
      });
    }
    await tx.done;
  }

  /** Server says the thread is gone (404/410): drop everything. */
  async deleteThread(threadId: string): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction([THREADS, DIGESTS], 'readwrite');
    await tx.objectStore(THREADS).delete(threadId);
    await tx.objectStore(DIGESTS).delete(threadId);
    await tx.done;
  }

  /**
   * Mirrors an optimistic thread-level flag update (e.g. archive) into the
   * cached pages. Watermark bookkeeping is untouched — the server-side bump
   * will re-hydrate and confirm.
   */
  async patchThreadFlags(
    threadId: string,
    patch: Partial<{ inbox_visible: boolean; is_read: boolean }>
  ): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction(THREADS, 'readwrite');
    const entry = await tx.store.get(threadId);
    const data = entry?.data as
      | { pages?: Record<string, unknown>[] }
      | undefined;
    if (entry && Array.isArray(data?.pages)) {
      await tx.store.put({
        ...entry,
        data: { ...data, pages: data.pages.map((p) => ({ ...p, ...patch })) },
      });
    }
    await tx.done;
  }

  /** Drops all rows belonging to a link (revoked/removed inbox). */
  async evictLink(linkId: string): Promise<void> {
    const db = this.requireDb();
    const tx = db.transaction([THREADS, DIGESTS], 'readwrite');
    const digests = tx.objectStore(DIGESTS);
    for (const digest of await digests.index('linkId').getAll(linkId)) {
      await tx.objectStore(THREADS).delete(digest.threadId);
      await digests.delete(digest.threadId);
    }
    await tx.done;
  }

  /**
   * Downgrades a link's digests to `pending` (never served-as-fresh) — used
   * when a delete event can't name the thread it deleted.
   */
  async markLinkPending(linkId: string, now: number): Promise<ThreadDigest[]> {
    const db = this.requireDb();
    const tx = db.transaction(DIGESTS, 'readwrite');
    const updated: ThreadDigest[] = [];
    for (const digest of await tx.store.index('linkId').getAll(linkId)) {
      const next: ThreadDigest = { ...digest, state: 'pending', cachedAt: now };
      await tx.store.put(next);
      updated.push(next);
    }
    await tx.done;
    return updated;
  }

  /**
   * Applies the retention policy: entries older than `maxAgeMs`, beyond
   * `maxCount`, or past the `maxBytes` budget are dropped (oldest first).
   * Returns the ids that were removed.
   */
  async prune(policy: {
    maxAgeMs: number;
    maxCount: number;
    maxBytes: number;
    now: number;
  }): Promise<string[]> {
    const digests = await this.loadDigests();
    const remove = new Set<string>();

    const byRecency = [...digests].sort((a, b) => b.cachedAt - a.cachedAt);
    let bytes = 0;
    byRecency.forEach((digest, index) => {
      bytes += digest.size;
      if (
        policy.now - digest.cachedAt > policy.maxAgeMs ||
        index >= policy.maxCount ||
        bytes > policy.maxBytes
      ) {
        remove.add(digest.threadId);
      }
    });

    if (remove.size > 0) {
      const db = this.requireDb();
      const tx = db.transaction([THREADS, DIGESTS], 'readwrite');
      for (const threadId of remove) {
        await tx.objectStore(THREADS).delete(threadId);
        await tx.objectStore(DIGESTS).delete(threadId);
      }
      await tx.done;
    }

    return [...remove];
  }
}
