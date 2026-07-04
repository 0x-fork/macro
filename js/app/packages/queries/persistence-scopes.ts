import { ENABLE_EMAIL_CONTENT_SYNC } from '@core/constant/featureFlags';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { hasLoginCookie } from '@core/util/cookies';
import { partialMatchKey, type QueryKey } from '@tanstack/query-core';
import { authKeys } from './auth/keys';
import { channelKeys } from './channel/keys';
import { createPersistenceKey, type PersistScope } from './persistence';
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
    // The email content cache (docs/email-content-cache.md) supersedes this
    // scope: it persists thread content durably, decoupled from query GC.
    // Running both would race two IDB writers over the same queries.
    ...(ENABLE_EMAIL_CONTENT_SYNC
      ? []
      : [
          {
            store: createPerQueryIDBStore({
              dbName: createPersistenceKey('email-threads', 1),
            }),
            maxAge: { value: 7, unit: 'd' },
            buster,
            shouldPersist: (queryKey: QueryKey) =>
              partialMatchKey(queryKey, ['email', 'threadMessages']),
          } satisfies PersistScope,
        ]),
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
