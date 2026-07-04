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
  channel: 8,
  emailThread: 12,
  document: 12,
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
  const documents = items.filter(
    (item) => item.type === 'document' && item.fileType === 'md'
  );
  const scored = sortByScoreDesc(documents, (item) =>
    toEpochMillis(item.updatedAt ?? null)
  );
  return {
    weight: HISTORY_SOURCE_WEIGHT,
    entries: scored.map((item) => ({
      kind: 'document' as const,
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

  setTimeout(() => {
    // Same idiom as packages/app/index.tsx: requestIdleCallback is missing
    // on some mobile webviews.
    const scheduleIdleTask =
      window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1));
    scheduleIdleTask(() => void runOpportunisticPrefetch());
  }, START_DELAY_MS);
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
