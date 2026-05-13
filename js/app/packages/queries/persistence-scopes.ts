import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { hasLoginCookie } from '@core/util/cookies';
import { partialMatchKey, type QueryKey } from '@tanstack/query-core';
import { authKeys } from './auth/keys';
import { channelKeys } from './channel/keys';
import { createPersistenceKey, type PersistScope } from './persistence';
import { createPerQueryIDBStore } from './persistence/per-query-idb';

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

// Must match CHANNEL_AVATAR_QUERY_KEY in packages/channel/Avatar/query.ts.
// Inlined to avoid pulling the channel package into queries' module graph.
const CHANNEL_AVATAR_QUERY_KEY = 'channel-avatar';

export function shouldPersistChannelAvatarQuery(queryKey: QueryKey): boolean {
  return partialMatchKey(queryKey, [CHANNEL_AVATAR_QUERY_KEY]);
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
        dbName: createPersistenceKey('channel-avatars', 1),
      }),
      maxAge: { value: 90, unit: 'd' },
      buster,
      shouldPersist: shouldPersistChannelAvatarQuery,
    },
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
}
