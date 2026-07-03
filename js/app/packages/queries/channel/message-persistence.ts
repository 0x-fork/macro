import { partialMatchKey, type QueryKey } from '@tanstack/query-core';
import type { ChannelMessagesData } from './channel-messages';
import { channelKeys } from './keys';

const persistedChannelContentQueryPrefixes = [
  channelKeys.messages._def,
  channelKeys.threadReplies._def,
] as const;

export function shouldPersistChannelContentQuery(queryKey: QueryKey): boolean {
  return persistedChannelContentQueryPrefixes.some((prefix) =>
    partialMatchKey(queryKey, prefix)
  );
}

/** Newest pages kept per persisted channel-messages entry (~50-250 messages). */
const MAX_PERSISTED_CHANNEL_MESSAGE_PAGES = 3;

/**
 * True when the newest page of a channel messages cache is the live bottom
 * of the conversation. A bottom-of-conversation load never has a previous
 * cursor on its newest page and never starts from a non-null page param;
 * anything else is a mid-conversation slice centered on an old target.
 * Shared with `clearStaleRestoredChannelData`, which removes restored
 * caches that fail this check.
 */
export function isBottomOfConversationSlice(data: ChannelMessagesData) {
  return data.pageParams[0] == null && !data.pages[0]?.previous_cursor;
}

function isChannelMessagesData(data: unknown): data is ChannelMessagesData {
  return (
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as ChannelMessagesData).pages) &&
    Array.isArray((data as ChannelMessagesData).pageParams)
  );
}

/**
 * Filters and trims channel content before persistence.
 *
 * Channel message caches are keyed by `loadAroundMessageId` and can hold
 * mid-conversation slices (deep links, jump-to-message). Restoring those
 * would render the channel centered on an old target, so only the default
 * (`loadAroundMessageId: null`) variant is persisted, and only while it is
 * a non-empty bottom-of-conversation slice. Pages are trimmed to the newest
 * few so a long scroll session doesn't balloon the entry (older history
 * remains reachable via `fetchNextPage` after restore).
 */
export function dehydrateChannelContentQuery(
  queryKey: QueryKey,
  data: unknown
): unknown {
  if (!partialMatchKey(queryKey, channelKeys.messages._def)) return data;

  const variant = queryKey.at(-1);
  if (
    typeof variant !== 'object' ||
    variant === null ||
    (variant as { loadAroundMessageId?: string | null }).loadAroundMessageId !=
      null
  ) {
    return undefined;
  }

  if (!isChannelMessagesData(data)) return undefined;
  if (data.pages.length === 0 || !isBottomOfConversationSlice(data)) {
    return undefined;
  }

  if (data.pages.length <= MAX_PERSISTED_CHANNEL_MESSAGE_PAGES) return data;
  return {
    pages: data.pages.slice(0, MAX_PERSISTED_CHANNEL_MESSAGE_PAGES),
    pageParams: data.pageParams.slice(0, MAX_PERSISTED_CHANNEL_MESSAGE_PAGES),
  };
}
