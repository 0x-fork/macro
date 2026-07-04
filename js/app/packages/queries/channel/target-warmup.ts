import { queryClient } from '../client';
import { readPersistedAppQueryData } from '../persistence-scopes';
import type { ChannelMessagesData } from './channel-messages';
import { channelKeys } from './keys';
import { channelMessagesDataContains } from './message-persistence';

/**
 * True when the given top-level message is already in the in-memory default
 * (bottom-of-conversation) cache for the channel. Used to open a targeted
 * navigation (notification tap, deep link) through the default query
 * variant — which paints instantly from cache — instead of mounting a
 * load-around variant that always refetches.
 */
export function isMessageInDefaultChannelCache(
  channelId: string,
  messageId: string
): boolean {
  const data = queryClient.getQueryData<ChannelMessagesData>(
    channelKeys.messages(channelId, null).queryKey
  );
  return !!data && channelMessagesDataContains(data, messageId);
}

/**
 * Best-effort pre-navigation warmup for targeted channel opens (e.g. a
 * tapped message notification): restores the persisted default
 * (bottom-of-conversation) slice into the query cache when it contains the
 * target message, so the channel can mount the default variant and paint
 * instantly instead of blocking on a load-around fetch. Resolves true when
 * the target is now available in the default cache.
 */
export async function seedChannelTargetFromPersistence(
  channelId: string,
  messageId: string
): Promise<boolean> {
  if (isMessageInDefaultChannelCache(channelId, messageId)) return true;

  const defaultKey = channelKeys.messages(channelId, null).queryKey;
  try {
    const persisted =
      await readPersistedAppQueryData<ChannelMessagesData>(defaultKey);
    if (!persisted || !channelMessagesDataContains(persisted, messageId)) {
      return false;
    }
    // Re-check the live cache: a fetch may have landed while we read IDB.
    const current = queryClient.getQueryData<ChannelMessagesData>(defaultKey);
    if (current) return channelMessagesDataContains(current, messageId);
    queryClient.setQueryData(defaultKey, persisted);
    return true;
  } catch {
    return false;
  }
}
