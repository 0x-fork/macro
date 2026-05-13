import { useQuery } from '@tanstack/solid-query';

import { pickAvatar, type PickedAvatar } from './pick';

export const CHANNEL_AVATAR_QUERY_KEY = 'channel-avatar';

export function channelAvatarQueryKey(
  name: string
): readonly [typeof CHANNEL_AVATAR_QUERY_KEY, string] {
  return [CHANNEL_AVATAR_QUERY_KEY, name.trim().toLowerCase()];
}

export function useChannelAvatarQuery(name: () => string | undefined) {
  return useQuery<PickedAvatar>(() => {
    const raw = name() ?? '';
    return {
      queryKey: channelAvatarQueryKey(raw),
      queryFn: () => pickAvatar(raw),
      enabled: raw.trim().length > 0,
      staleTime: Infinity,
      gcTime: Infinity,
      // pickAvatar handles its own retry + fallback; never retry on top.
      retry: false,
    };
  });
}
