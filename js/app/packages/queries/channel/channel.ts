import {
  catchToResult,
  isErr,
  type MaybeResult,
  ok,
  throwOnErr,
} from '@core/util/maybeResult';
import { commsServiceClient } from '@service-comms/client';
import type { getChannelResponseError } from '@service-comms/generated/client';
import type { GetChannelResponse } from '@service-comms/generated/models';
import type { Attachment } from '@service-comms/generated/models/attachment';
import type { CountedReaction } from '@service-comms/generated/models/countedReaction';
import type { Message } from '@service-comms/generated/models/message';
import {
  type QueryClient,
  type UseBaseQueryOptions,
  useQuery,
} from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { queryClient } from '../client';
import { patchQueryData, upsertById } from '../cache';
import { channelKeys } from './keys';

type ChannelQueryOptions = UseBaseQueryOptions<
  GetChannelResponse,
  getChannelResponseError
>;

// Channel data is mostly static; realtime updates patch the cache. We keep it "fresh"
// for a long time, but still reconcile on open via `refetchOnMount: 'always'`.
export const CHANNEL_STALE_TIME_MS = 1000 * 60 * 60 * 24; // 24 hours

/**
 * Shared query options for getting a channel with an ID
 */
export function channelQueryOptions(channelId: string): ChannelQueryOptions {
  return {
    queryKey: channelKeys.withID(channelId).queryKey,
    staleTime: CHANNEL_STALE_TIME_MS,
    refetchOnMount: 'always',
    queryFn: async () => {
      const result = await throwOnErr(
        async () =>
          await commsServiceClient.getChannel({
            channel_id: channelId,
          })
      );

      return result;
    },
  };
}

/**
 * Imperatively fetch a channel (for use outside of components).
 * Cache-first: returns cached data immediately if present.
 * If missing, fetches from server and caches.
 */
export async function fetchAndCacheChannel(
  channelId: string
): Promise<MaybeResult<string, { channel: GetChannelResponse }>> {
  const key = channelKeys.withID(channelId).queryKey;
  const cached = queryClient.getQueryData<GetChannelResponse>(key);
  if (cached) {
    // Reconcile happens on mount via `refetchOnMount: 'always'`.
    return ok({ channel: cached });
  }

  const result = await catchToResult(
    async () =>
      await queryClient.ensureQueryData(channelQueryOptions(channelId))
  );

  if (isErr(result)) {
    return result;
  }

  return ok({ channel: result[1] });
}

/**
 * Query hook for fetching a channel
 */
export function useChannelQuery(
  channelId: Accessor<string>,
  options?: Accessor<Omit<ChannelQueryOptions, 'queryKey' | 'queryFn'>>,
  queryClient?: Accessor<QueryClient>
) {
  return useQuery(() => {
    return {
      initialData: undefined,
      ...options?.(),
      ...channelQueryOptions(channelId()),
    };
  }, queryClient);
}

/**
 * Force-refetch a channel (ignores freshness) and update the query cache.
 * Useful for imperative refresh flows (tab focus, manual refresh, etc.).
 */
export async function forceRefetchChannel(
  channelId: string
): Promise<MaybeResult<string, { channel: GetChannelResponse }>> {
  const key = channelKeys.withID(channelId).queryKey;
  await queryClient.invalidateQueries({ queryKey: key });

  const result = await catchToResult(async () =>
    queryClient.fetchQuery(channelQueryOptions(channelId))
  );

  if (isErr(result)) return result;
  return ok({ channel: result[1] });
}

export function optimisticUpdateChannelName(
  channelID: string,
  newName: string
) {
  const queryKey = channelKeys.withID(channelID).queryKey;
  queryClient.cancelQueries({ queryKey });

  queryClient.setQueriesData(
    { queryKey },
    (prev: GetChannelResponse | undefined) => {
      if (!prev) return;

      const next = {
        ...prev,
        channel: {
          ...prev.channel,
          name: newName,
          updatedAt: new Date().toISOString(),
        },
      };

      return { ...next };
    }
  );
}

export function invalidateChannelWithID(channelID: string) {
  queryClient.invalidateQueries({
    queryKey: channelKeys.withID(channelID).queryKey,
  });
}

/**
 * Update cached channel query data (source-of-truth for channel server state).
 * This is the recommended way for websocket events + optimistic UI to update channel state.
 */
export function updateChannelCache(
  channelID: string,
  updater: (prev: GetChannelResponse | undefined) => GetChannelResponse | undefined
) {
  patchQueryData<GetChannelResponse>(channelKeys.withID(channelID).queryKey, updater);
}

/**
 * Upsert a message into the channel's cached messages array.
 */
export function upsertChannelMessageInCache(channelID: string, message: Message) {
  updateChannelCache(channelID, (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      messages: upsertById(prev.messages ?? [], message),
    };
  });
}

/**
 * Replace a message id in the channel cache (used for optimistic temp ids).
 */
export function replaceChannelMessageIdInCache(
  channelID: string,
  fromId: string,
  toId: string
) {
  updateChannelCache(channelID, (prev) => {
    if (!prev) return prev;
    const msgs = prev.messages ?? [];
    const idx = msgs.findIndex((m) => m.id === fromId);
    if (idx === -1) return prev;
    const existing = msgs[idx]!;
    const nextMsg: Message = { ...existing, id: toId };
    const nextMsgs = msgs.slice();
    nextMsgs[idx] = nextMsg;
    return { ...prev, messages: nextMsgs };
  });
}

/**
 * Merge attachments into the channel cache (add/replace by attachment.id).
 * Use this when websocket payload is "delta" / add-only.
 */
export function mergeChannelAttachmentsInCache(
  channelID: string,
  attachments: Attachment[]
) {
  updateChannelCache(channelID, (prev) => {
    if (!prev) return prev;
    const existing = prev.attachments ?? [];
    let next = existing;
    for (const a of attachments) {
      next = upsertById(next, a);
    }
    return { ...prev, attachments: next };
  });
}

/**
 * Replace attachments for a specific message in the channel cache.
 * Use this when websocket payload is authoritative for a message's attachments.
 */
export function replaceChannelMessageAttachmentsInCache(
  channelID: string,
  messageID: string,
  attachments: Attachment[]
) {
  updateChannelCache(channelID, (prev) => {
    if (!prev) return prev;
    const remaining = (prev.attachments ?? []).filter(
      (a) => a.message_id !== messageID
    );
    const deduped: Attachment[] = [];
    const seen = new Set<string>();
    for (const a of attachments) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      deduped.push(a);
    }
    return { ...prev, attachments: [...remaining, ...deduped] };
  });
}

/**
 * Set reactions for a message in the channel cache.
 */
export function setChannelMessageReactionsInCache(
  channelID: string,
  messageID: string,
  reactions: CountedReaction[]
) {
  updateChannelCache(channelID, (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      reactions: {
        ...(prev.reactions ?? {}),
        [messageID]: reactions,
      },
    };
  });
}
