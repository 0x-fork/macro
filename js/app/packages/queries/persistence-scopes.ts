import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { hasLoginCookie } from '@core/util/cookies';
import { partialMatchKey, type QueryKey } from '@tanstack/query-core';
import { authKeys } from './auth/keys';
import { channelKeys } from './channel/keys';
import {
  createPersistenceKey,
  dehydrateFirstPage,
  isInfiniteData,
  type PersistScope,
} from './persistence';
import { createPerQueryIDBStore } from './persistence/per-query-idb';
import { soupKeys } from './soup/keys';

const persistedChannelQueryPrefixes = [
  channelKeys.mentions._def,
  channelKeys.activity.queryKey,
  channelKeys.listChannels.queryKey,
] as const;

export function shouldPersistChannelQuery(queryKey: QueryKey): boolean {
  return persistedChannelQueryPrefixes.some((prefix) =>
    partialMatchKey(queryKey, prefix)
  );
}

/**
 * Matches only the default channel messages variant,
 * ['channel', 'messages', channelId, { loadAroundMessageId: null }].
 * Load-around variants are mid-conversation slices keyed separately; their
 * cursors are not a useful starting point for a later session.
 */
export function shouldPersistChannelMessagesQuery(
  queryKey: QueryKey
): boolean {
  if (!partialMatchKey(queryKey, channelKeys.messages._def)) return false;
  const params = queryKey[3];
  return (
    typeof params === 'object' &&
    params !== null &&
    (params as { loadAroundMessageId?: unknown }).loadAroundMessageId === null
  );
}

/**
 * Persists only a bottom-anchored window of channel messages, sliced to the
 * newest page (pages are newest-first). The default variant can temporarily
 * hold mid-conversation data copied over from a load-around session —
 * recognizable by a non-null first page param or a `previous_cursor` on the
 * newest page — and those states are skipped so the persisted entry keeps
 * the last true latest page.
 */
export function dehydrateLatestChannelMessagesPage(data: unknown): unknown {
  if (!isInfiniteData(data)) return undefined;
  const newestPage = data.pages[0];
  const isBottomAnchored =
    data.pageParams[0] == null &&
    typeof newestPage === 'object' &&
    newestPage !== null &&
    !(newestPage as { previous_cursor?: string | null }).previous_cursor;
  return isBottomAnchored ? dehydrateFirstPage(data) : undefined;
}

export function createQueryPersistenceScopes(
  buster: string
): readonly PersistScope[] {
  return [
    {
      store: createPerQueryIDBStore({
        dbName: createPersistenceKey('channels', 1),
      }),
      maxAge: { value: 7, unit: 'd' },
      buster,
      shouldPersist: shouldPersistChannelQuery,
    },
    {
      store: createPerQueryIDBStore({
        dbName: createPersistenceKey('email-threads', 1),
      }),
      maxAge: { value: 7, unit: 'd' },
      buster,
      shouldPersist: (queryKey) =>
        partialMatchKey(queryKey, ['email', 'threadMessages']),
    },
    {
      store: createPerQueryIDBStore({
        dbName: createPersistenceKey('channel-messages', 1),
      }),
      maxAge: { value: 7, unit: 'd' },
      buster,
      shouldPersist: shouldPersistChannelMessagesQuery,
      dehydrateData: dehydrateLatestChannelMessagesPage,
      // Channel views unmount on navigation and the target-message controller
      // removes the default query to clear load-around residue; the persisted
      // latest page must survive both to be there on the next open.
      retainOnRemoval: true,
    },
    ...(isNativeMobilePlatform()
      ? [
          {
            store: createPerQueryIDBStore({
              dbName: createPersistenceKey('soup-list-queries', 1),
            }),
            maxAge: { value: 7, unit: 'd' },
            buster,
            shouldPersist: (queryKey: QueryKey) =>
              partialMatchKey(queryKey, soupKeys.astItems._def),
            shouldRestore: hasLoginCookie,
            dehydrateData: dehydrateFirstPage,
          } satisfies PersistScope,
          {
            store: createPerQueryIDBStore({
              dbName: createPersistenceKey('user-info', 1),
            }),
            maxAge: { value: 7, unit: 'd' },
            buster,
            shouldPersist: (queryKey: QueryKey) =>
              partialMatchKey(queryKey, authKeys.userInfo.queryKey),
            shouldRestore: hasLoginCookie,
          } satisfies PersistScope,
        ]
      : []),
  ];
}
