import type { RawUpdate } from '@core/collab/shared';
import {
  IDBSnapshotStore,
  LORO_SNAPSHOT_DB_NAME,
} from '@core/collab/snapshot-store';
import { hasLoginCookie } from '@core/util/cookies';
import type { GetAllUserNotificationsResponse } from '@service-notification/generated/schemas/getAllUserNotificationsResponse';
import type { ApiChannelWithLatest } from '@service-storage/channel-list-types';
import { storageServiceClient } from '@service-storage/client';
import type { SoupApiItem } from '@service-storage/generated/schemas';
import type { InfiniteData } from '@tanstack/query-core';
import { channelMessagesQueryOptions } from '../channel/channel-messages';
import { channelKeys } from '../channel/keys';
import { queryClient } from '../client';
import { emailKeys } from '../email/keys';
import { historyKeys } from '../history/keys';
import type { HistoryItem } from '../history/types';
import { notificationKeys } from '../notification/keys';
import type { SoupAstItemsPage } from '../soup/items';
import { soupKeys } from '../soup/keys';
import { seedDocumentLoadBundle } from '../storage/documentLoad/documentLoadBundle';
import {
  fusePrefetchSources,
  type PrefetchCandidate,
  type PrefetchEntityKind,
  type PrefetchEntityRef,
  type RankedPrefetchSource,
  sortByScoreDesc,
  toEpochMillis,
} from './ranking';

/**
 * Opportunistic prefetch: shortly after an authenticated start, guess which
 * entities the user is likely to open (frecency, inbox notifications,
 * recent history, channel activity) and warm their content queries. Every
 * prefetch goes through the same query options the UI uses, so results land
 * in the query cache and are written to IndexedDB by the persistence
 * scopes — making likely-next channels, email threads, and documents open
 * instantly and survive offline/cold starts.
 */

const START_DELAY_MS = 12_000;
const CONCURRENCY = 2;

const CANDIDATE_LIMITS: Record<PrefetchEntityKind, number> = {
  channel: 40,
  emailThread: 50,
  document: 40,
  chat: 20,
};

/** Signal weights: inbox notifications are the strongest "will open next" hint. */
const NOTIFICATION_SOURCE_WEIGHT = 1.5;
const CHANNEL_SOURCE_WEIGHT = 1.25;
const SOUP_SOURCE_WEIGHT = 1;
const HISTORY_SOURCE_WEIGHT = 0.75;

function channelListSource(): RankedPrefetchSource {
  const channels =
    queryClient.getQueryData<ApiChannelWithLatest[]>(
      channelKeys.listChannels.queryKey
    ) ?? [];

  const scored = sortByScoreDesc(channels, (channel) => {
    const latestTs = toEpochMillis(channel.latest_message?.created_at);
    const unread = latestTs > toEpochMillis(channel.viewed_at) ? 1 : 0;
    // Unread channels first, then the server-computed frecency, with the
    // latest-message time as a tiny tiebreaker.
    return (
      unread * 1e15 + (channel.frecency_score ?? 0) * 1e3 + latestTs / 1e12
    );
  });

  return {
    weight: CHANNEL_SOURCE_WEIGHT,
    entries: scored.map((channel) => ({
      kind: 'channel' as const,
      id: channel.id,
    })),
  };
}

function soupItemToRef(item: SoupApiItem): PrefetchEntityRef | undefined {
  switch (item.tag) {
    case 'channel':
      return { kind: 'channel', id: item.data.channel.id };
    case 'emailThread':
      return { kind: 'emailThread', id: item.data.id };
    case 'chat':
      return { kind: 'chat', id: item.data.id };
    case 'document':
      // Only markdown-backed docs (incl. tasks/snippets) have Loro content.
      return item.data.fileType === 'md'
        ? { kind: 'document', id: item.data.id }
        : undefined;
    default:
      return undefined;
  }
}

function soupListSource(): RankedPrefetchSource {
  const queries = queryClient.getQueriesData<InfiniteData<SoupAstItemsPage>>({
    queryKey: soupKeys.astItems._def,
  });

  const bestByKey = new Map<
    string,
    { ref: PrefetchEntityRef; score: number }
  >();
  for (const [, data] of queries) {
    for (const page of data?.pages ?? []) {
      const items =
        page.kind === 'flat' ? page.items : Object.values(page.items);
      for (const item of items) {
        const ref = soupItemToRef(item);
        if (!ref) continue;
        const key = `${ref.kind}:${ref.id}`;
        const score = item.frecency_score ?? 0;
        const existing = bestByKey.get(key);
        if (!existing || existing.score < score) {
          bestByKey.set(key, { ref, score });
        }
      }
    }
  }

  const scored = sortByScoreDesc([...bestByKey.values()], (e) => e.score);
  return {
    weight: SOUP_SOURCE_WEIGHT,
    entries: scored.map((e) => e.ref),
  };
}

function notificationsSource(): RankedPrefetchSource {
  const queries = queryClient.getQueriesData<
    InfiniteData<GetAllUserNotificationsResponse>
  >({ queryKey: notificationKeys.user._def });

  const refs: Array<{ ref: PrefetchEntityRef; score: number }> = [];
  const seen = new Set<string>();
  for (const [, data] of queries) {
    for (const page of data?.pages ?? []) {
      for (const notification of page.items ?? []) {
        if (notification.done) continue;
        const ref = notificationEntityRef(
          notification.entity_type,
          notification.entity_id
        );
        if (!ref) continue;
        const key = `${ref.kind}:${ref.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const unviewed = notification.viewed_at ? 0 : 1;
        refs.push({
          ref,
          score: unviewed * 1e15 + toEpochMillis(notification.created_at),
        });
      }
    }
  }

  return {
    weight: NOTIFICATION_SOURCE_WEIGHT,
    entries: sortByScoreDesc(refs, (e) => e.score).map((e) => e.ref),
  };
}

function notificationEntityRef(
  entityType: string,
  entityId: string
): PrefetchEntityRef | undefined {
  switch (entityType) {
    case 'channel':
      return { kind: 'channel', id: entityId };
    case 'email_thread':
      return { kind: 'emailThread', id: entityId };
    case 'document':
      return { kind: 'document', id: entityId };
    default:
      return undefined;
  }
}

function historySource(): RankedPrefetchSource {
  // Cache read via the key (not history.ts's getHistoryItems) to keep the
  // block registry out of this startup-adjacent module's import graph.
  const items =
    queryClient.getQueryData<HistoryItem[]>(historyKeys.list.queryKey) ?? [];
  const prefetchable = items.filter(
    (item) =>
      (item.type === 'document' && item.fileType === 'md') ||
      item.type === 'chat'
  );
  const scored = sortByScoreDesc(prefetchable, (item) =>
    toEpochMillis(item.updatedAt ?? null)
  );
  return {
    weight: HISTORY_SOURCE_WEIGHT,
    entries: scored.map((item) => ({
      kind: item.type === 'chat' ? ('chat' as const) : ('document' as const),
      id: item.id,
    })),
  };
}

async function prefetchChannel(channelId: string): Promise<void> {
  // No-op when the cache already has fresh data (staleTime: Infinity), and
  // the result auto-persists via the channel-messages scope.
  await queryClient.prefetchInfiniteQuery(
    channelMessagesQueryOptions(channelId, null)
  );
}

async function prefetchEmailThread(threadId: string): Promise<void> {
  // Lazy import: thread.ts pulls UI modules (toast, icons) that this
  // startup-adjacent module must not add to the critical bundle.
  const { fetchAndCacheThread } = await import('../email/thread');
  // fetchInfiniteQuery under the hood: respects the 5-minute staleTime and
  // auto-persists via the email-threads scope.
  await fetchAndCacheThread(threadId);
}

async function prefetchChat(chatId: string): Promise<void> {
  // Cache-first within the chat stale window; the result auto-persists via
  // the chats scope, so recently used agents open instantly and offline.
  const { prefetchChatLoad } = await import('../cognition/chat-load');
  await prefetchChatLoad(chatId);
}

async function prefetchDocument(documentId: string): Promise<void> {
  const result = await storageServiceClient.getDocumentMetadata({
    documentId,
  });
  if (result.isErr()) return;
  const { documentMetadata, userAccessLevel } = result.value;

  // Seed the load bundle so an offline open has metadata; the blanked token
  // is refreshed by the sync source on connect. Persisted by the documents
  // scope.
  seedDocumentLoadBundle(documentId, {
    documentMetadata,
    userAccessLevel,
    token: '',
  });

  if (documentMetadata.fileType !== 'md') return;

  // Warm the local Loro snapshot so the doc body renders offline. Never
  // overwrite an existing local snapshot — it may hold newer local state.
  const snapshotStore = new IDBSnapshotStore<RawUpdate>(
    LORO_SNAPSHOT_DB_NAME,
    documentId
  );
  if ((await snapshotStore.load()) !== null) return;
  const snapshot = await storageServiceClient.fetchCachedSnapshot(documentId);
  if (snapshot.isOk()) {
    await snapshotStore.save(snapshot.value);
  }
}

async function prefetchCandidate(candidate: PrefetchCandidate): Promise<void> {
  try {
    if (candidate.kind === 'channel') await prefetchChannel(candidate.id);
    else if (candidate.kind === 'emailThread')
      await prefetchEmailThread(candidate.id);
    else if (candidate.kind === 'chat') await prefetchChat(candidate.id);
    else await prefetchDocument(candidate.id);
  } catch (error) {
    console.debug('[prefetch] opportunistic prefetch failed', {
      candidate,
      error,
    });
  }
}

async function runPool(
  tasks: ReadonlyArray<() => Promise<void>>,
  concurrency: number
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, tasks.length) },
    async () => {
      while (next < tasks.length) {
        const task = tasks[next++];
        await task();
      }
    }
  );
  await Promise.all(workers);
}

/** Exposed for tests. */
export function collectPrefetchCandidates(): PrefetchCandidate[] {
  return fusePrefetchSources(
    [
      notificationsSource(),
      channelListSource(),
      soupListSource(),
      historySource(),
    ],
    CANDIDATE_LIMITS
  );
}

async function runOpportunisticPrefetch(): Promise<void> {
  if (!hasLoginCookie()) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener('online', () => void runOpportunisticPrefetch(), {
      once: true,
    });
    return;
  }

  const candidates = collectPrefetchCandidates();
  if (candidates.length === 0) return;

  await runPool(
    candidates.map((candidate) => () => prefetchCandidate(candidate)),
    CONCURRENCY
  );
}

let scheduled = false;

/**
 * Schedules one opportunistic prefetch run per app session, delayed past
 * startup and deferred to browser idle time so it never competes with
 * first paint. Call once auth is confirmed.
 */
export function scheduleOpportunisticPrefetch(): void {
  if (scheduled) return;
  scheduled = true;

  setupInboxEmailWarming();

  setTimeout(() => {
    // Same idiom as packages/app/index.tsx: requestIdleCallback is missing
    // on some mobile webviews.
    const scheduleIdleTask =
      window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
    scheduleIdleTask(() => void runOpportunisticPrefetch());
  }, START_DELAY_MS);
}

/**
 * Inbox email warming: whenever a soup list query (re)loads — startup,
 * refetch, or new mail arriving — and on a steady re-warm cycle, prefetch
 * the email threads visible in it. The email block's load() only resolves
 * without a network round-trip when the thread query is FRESH (within its
 * 5-minute staleTime), so flicker-free j/k depends on keeping the visible
 * inbox perpetually fresh, not merely cached: threads are re-warmed once
 * their data is older than a threshold just under the staleTime. Results
 * persist via the email-threads scope, keeping the inbox readable offline.
 */
const INBOX_EMAIL_WARM_LIMIT = 100;
/** Repeat-protection only; freshness is governed by the threshold below. */
const INBOX_EMAIL_WARM_TTL_MS = 3 * 60 * 1000;
const INBOX_EMAIL_WARM_DEBOUNCE_MS = 300;
/** Re-warm data older than this — just under THREAD_STALE_TIME (5 min) so
 * the block loader always finds fresh data and resolves from cache. */
const INBOX_EMAIL_REWARM_AGE_MS = 4 * 60 * 1000;
/** Steady re-warm cadence while the tab is visible. */
const INBOX_EMAIL_REWARM_INTERVAL_MS = 4 * 60 * 1000;
const INBOX_EMAIL_WARM_CONCURRENCY = 3;

const recentEmailWarm = new Map<string, number>();
let inboxWarmTimer: ReturnType<typeof setTimeout> | null = null;

/** True for soup list queries backing the email INBOX views. Warming keys
 * off these only: warming from Sent/Drafts/label lists would stampede up
 * to the full warm limit of thread fetches every time such a tab opens. */
function isInboxSoupQueryKey(queryKey: readonly unknown[]): boolean {
  const body = queryKey[3] as { emailView?: string } | undefined;
  return body?.emailView === 'inbox';
}

/** Email thread ids across cached inbox soup queries, in list order. */
function collectSoupEmailThreadIds(): string[] {
  const queries = queryClient.getQueriesData<InfiniteData<SoupAstItemsPage>>({
    queryKey: soupKeys.astItems._def,
  });

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const [queryKey, data] of queries) {
    if (!isInboxSoupQueryKey(queryKey)) continue;
    for (const page of data?.pages ?? []) {
      const items =
        page.kind === 'flat' ? page.items : Object.values(page.items);
      for (const item of items) {
        if (item.tag !== 'emailThread') continue;
        const id = item.data.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return ids;
}

/**
 * Decides whether one thread needs a warm fetch right now. Skips threads
 * that were attempted very recently, are still fresh enough for the block
 * loader's cache fast-path, or are actively open (refetching an observed
 * thread query re-triggers its Suspense boundary and resets scroll — the
 * open view manages its own lifecycle).
 */
function shouldWarmEmailThread(threadId: string, now: number): boolean {
  const last = recentEmailWarm.get(threadId);
  if (last && now - last < INBOX_EMAIL_WARM_TTL_MS) return false;

  const queryKey = emailKeys.threadMessages(threadId).queryKey;
  const query = queryClient.getQueryCache().find({ queryKey });
  if (query && query.getObserversCount() > 0) {
    recentEmailWarm.set(threadId, now);
    return false;
  }
  if (
    query?.state.status === 'success' &&
    now - query.state.dataUpdatedAt < INBOX_EMAIL_REWARM_AGE_MS
  ) {
    recentEmailWarm.set(threadId, now);
    return false;
  }
  return true;
}

async function warmInboxEmailThreads(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    return;

  const now = Date.now();
  const tasks: Array<() => Promise<void>> = [];
  for (const id of collectSoupEmailThreadIds()) {
    if (tasks.length >= INBOX_EMAIL_WARM_LIMIT) break;
    if (!shouldWarmEmailThread(id, now)) continue;

    recentEmailWarm.set(id, now);
    tasks.push(() => prefetchEmailThread(id).catch(() => {}));
  }

  if (tasks.length === 0) return;
  await runPool(tasks, INBOX_EMAIL_WARM_CONCURRENCY);
}

/**
 * Warms one email thread's messages immediately (TTL-deduped, respects the
 * thread query's staleTime). Used for j/k neighbor prefetch in the inbox so
 * the next thread in the travel direction is already cached when opened.
 */
export function warmEmailThread(threadId: string): void {
  if (!threadId) return;
  const now = Date.now();
  if (!shouldWarmEmailThread(threadId, now)) return;

  recentEmailWarm.set(threadId, now);
  void prefetchEmailThread(threadId).catch(() => {});
}

function setupInboxEmailWarming(): void {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated') return;
    if (event.query.state.status !== 'success') return;
    const key = event.query.queryKey;
    if (key[0] !== 'soup' || key[1] !== 'astItems') return;
    if (!isInboxSoupQueryKey(key)) return;

    if (inboxWarmTimer) return;
    inboxWarmTimer = setTimeout(() => {
      inboxWarmTimer = null;
      void warmInboxEmailThreads();
    }, INBOX_EMAIL_WARM_DEBOUNCE_MS);
  });

  // Steady re-warm keeps the visible inbox inside the thread staleTime, so
  // j/k opens resolve from cache even after the tab has idled a while.
  setInterval(
    () => void warmInboxEmailThreads(),
    INBOX_EMAIL_REWARM_INTERVAL_MS
  );
}

/** Channels warmed from live message traffic, with a TTL so a chatty
 * channel is only refreshed once per window. */
const recentIncomingWarm = new Map<string, number>();
const INCOMING_WARM_TTL_MS = 30 * 60 * 1000;

/**
 * Warms a channel's message cache when a live message arrives for a channel
 * we have nothing cached for. Channels messaging you now are the likeliest
 * next tap (push notifications point at them), so this keeps their first
 * page persisted and instant to open.
 */
export function warmChannelOnIncomingMessage(channelId: string): void {
  const now = Date.now();
  const last = recentIncomingWarm.get(channelId);
  if (last && now - last < INCOMING_WARM_TTL_MS) return;

  const defaultKey = channelKeys.messages(channelId, null).queryKey;
  if (queryClient.getQueryData(defaultKey) !== undefined) return;

  recentIncomingWarm.set(channelId, now);
  void prefetchChannel(channelId).catch(() => {
    recentIncomingWarm.delete(channelId);
  });
}
