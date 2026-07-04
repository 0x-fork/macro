import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { hasLoginCookie } from '@core/util/cookies';
import { hashKey, partialMatchKey, type QueryKey } from '@tanstack/query-core';
import { authKeys } from './auth/keys';
import { channelKeys } from './channel/keys';
import {
  dehydrateChannelContentQuery,
  shouldPersistChannelContentQuery,
} from './channel/message-persistence';
import { entityKeys } from './entity/keys';
import { notificationKeys } from './notification/keys';
import {
  createPersistenceKey,
  type PersistScope,
  readPersistedQueryData,
  trimInfiniteQueryPages,
} from './persistence';
import { createPerQueryIDBStore } from './persistence/per-query-idb';
import { soupKeys } from './soup/keys';
import { documentLoadKeys } from './storage/documentLoad/keys';

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

export function shouldPersistDocumentLoadQuery(queryKey: QueryKey): boolean {
  return partialMatchKey(queryKey, documentLoadKeys.bundle._def);
}

/**
 * The load bundle carries a short-lived sync-service permission token.
 * Persisting it is pointless (it expires within minutes) and undesirable
 * (credentials at rest), so it is blanked; the sync source fetches a fresh
 * token on connect when given an empty one.
 */
export function dehydrateDocumentLoadQuery(
  _queryKey: QueryKey,
  data: unknown
): unknown {
  if (typeof data !== 'object' || data === null) return data;
  return { ...data, token: '' };
}

/**
 * Storage hash for soup list queries. The exact query key embeds two parts
 * that differ between a cold start and a settled session, so an exact-hash
 * lookup would never restore:
 * - `transport` (index 5) flips undefined -> 'graphql' once feature flags
 *   finish their async bootstrap; the data is identical either way.
 * - the body's `cthf` target (channel-thread filter) embeds a live
 *   notification-derived thread-id list that is empty at startup and
 *   changes as notifications arrive/clear.
 * Both are dropped, so all variants of one logical view share a slot and
 * the cold-start query restores the last settled result; the background
 * refetch reconciles any filter drift.
 */
export function soupListStorageHash(queryKey: QueryKey): string {
  const [scope, family, params, body, groupBy] = queryKey;
  const normalizedBody =
    typeof body === 'object' && body !== null
      ? { ...body, cthf: undefined }
      : body;
  return hashKey([scope, family, params, normalizedBody, groupBy]);
}

let activeScopes: readonly PersistScope[] = [];

export function createQueryPersistenceScopes(
  buster: string
): readonly PersistScope[] {
  /**
   * A scope that caches content for cold starts: entries survive
   * query-cache eviction (their queries are routinely garbage-collected
   * minutes after unmount), expiring via maxAge, the buster, and the
   * startup sweep instead.
   *
   * Deliberately NOT gated on hasLoginCookie: the login marker is a
   * script-set cookie/localStorage flag that Safari ITP evicts and
   * logout/re-login windows clear, so gating restore on it silently
   * disables caching for valid sessions. A query only mounts (and thus
   * restores) from authenticated UI, and logout does not clear these
   * stores either way.
   */
  const contentScope = (
    name: string,
    options: Pick<PersistScope, 'shouldPersist' | 'dehydrate' | 'storageHash'>
  ): PersistScope => ({
    store: createPerQueryIDBStore({ dbName: createPersistenceKey(name, 1) }),
    maxAge: { value: 7, unit: 'd' },
    buster,
    evictOnRemoval: false,
    ...options,
  });

  activeScopes = [
    contentScope('channels', { shouldPersist: shouldPersistChannelQuery }),
    contentScope('channel-messages', {
      shouldPersist: shouldPersistChannelContentQuery,
      dehydrate: dehydrateChannelContentQuery,
    }),
    contentScope('email-threads', {
      shouldPersist: (queryKey) =>
        partialMatchKey(queryKey, ['email', 'threadMessages']),
    }),
    contentScope('documents', {
      shouldPersist: shouldPersistDocumentLoadQuery,
      dehydrate: dehydrateDocumentLoadQuery,
    }),
    contentScope('soup-list-queries', {
      shouldPersist: (queryKey) =>
        partialMatchKey(queryKey, soupKeys.astItems._def),
      storageHash: soupListStorageHash,
    }),
    // Viewer's own permission level per entity. Restoring it un-suspends
    // EntityPermissionsGate instantly on cold starts (e.g. opening a channel
    // from a notification tap); the server stays authoritative and the
    // background refetch reconciles.
    contentScope('entity-permissions', {
      shouldPersist: (queryKey) =>
        partialMatchKey(queryKey, entityKeys.permissions._def),
    }),
    contentScope('notifications', {
      shouldPersist: (queryKey) =>
        partialMatchKey(queryKey, notificationKeys.user._def),
      dehydrate: trimInfiniteQueryPages(3),
    }),
    // Entity previews (names, icons, file types) back mentions, tabs, and
    // list rows everywhere; restoring them makes cold starts paint real
    // names instead of placeholders.
    contentScope('previews', {
      shouldPersist: (queryKey) =>
        queryKey[0] === 'preview' && queryKey[1] === 'item',
    }),
    ...(isNativeMobilePlatform()
      ? [
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
  return activeScopes;
}

/**
 * Reads persisted data for a query key from the app's active persistence
 * scopes, bypassing the query cache. Returns undefined when persistence has
 * not been set up, no scope matches, or the entry is missing/expired.
 */
export function readPersistedAppQueryData<T>(
  queryKey: QueryKey
): Promise<T | undefined> {
  return readPersistedQueryData<T>(activeScopes, queryKey);
}
