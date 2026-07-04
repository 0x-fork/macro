import { queryClient } from '@queries/client';
import { cognitionApiServiceClient } from '@service-cognition/client';
import type { GetChatResponse } from '@service-cognition/generated/schemas/getChatResponse';

/**
 * The chat open payload (chat + full message history + access level),
 * routed through the query client so opens hit cache, prefetch can warm
 * recent agents, and the 'chats' persistence scope restores them across
 * reloads. Scoped under `entity` so `invalidateQueries({ queryKey:
 * ['entity'] })` (fired from move/rename mutations) refreshes it.
 */
export const chatLoadKeys = {
  prefix: ['entity', 'chatLoad'] as const,
  byId: (chatId: string) => ['entity', 'chatLoad', chatId] as const,
};

/**
 * Chats stay servable from cache for a few minutes; the opportunistic
 * prefetch warms recent agents so opens usually land in this window.
 * Recently open chats also keep their whole tree alive (keepAlive on the
 * block definition), which bypasses load() entirely.
 */
const CHAT_LOAD_STALE_TIME_MS = 5 * 60 * 1000;

export class ChatLoadError extends Error {
  readonly codes: string[];
  constructor(codes: string[]) {
    super(`Failed to load chat: ${codes.join(', ')}`);
    this.codes = codes;
  }
}

async function fetchChat(chatId: string): Promise<GetChatResponse> {
  const result = await cognitionApiServiceClient.getChat({ chat_id: chatId });
  if (result.isErr()) {
    throw new ChatLoadError(result.error.map((error) => String(error.code)));
  }
  return result.value;
}

/**
 * Fetches a chat through the query client (cache-first within the stale
 * window). When the server is unreachable, falls back to the last known
 * payload — including one restored from IndexedDB — so a previously
 * opened agent still opens offline. Authoritative rejections
 * (unauthorized, missing) keep failing.
 */
export async function fetchChatLoad(chatId: string): Promise<GetChatResponse> {
  try {
    return await queryClient.fetchQuery({
      queryKey: chatLoadKeys.byId(chatId),
      queryFn: () => fetchChat(chatId),
      staleTime: CHAT_LOAD_STALE_TIME_MS,
      retry: 1,
    });
  } catch (error) {
    const serverUnreachable =
      error instanceof ChatLoadError &&
      error.codes.some(
        (code) => code === 'NETWORK_ERROR' || code === 'UNKNOWN_ERROR'
      );
    if (serverUnreachable) {
      const cached = queryClient.getQueryData<GetChatResponse>(
        chatLoadKeys.byId(chatId)
      );
      if (cached) return cached;
    }
    throw error;
  }
}

/** Fire-and-forget warm of a chat's open payload (dedupes with in-flight
 * fetches; no-op while the cached copy is still fresh). */
export function prefetchChatLoad(chatId: string): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: chatLoadKeys.byId(chatId),
    queryFn: () => fetchChat(chatId),
    staleTime: CHAT_LOAD_STALE_TIME_MS,
    retry: 1,
  });
}
