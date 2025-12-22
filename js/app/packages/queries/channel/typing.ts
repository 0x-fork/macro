import { throwOnErr } from '@core/util/maybeResult';
import { commsServiceClient } from '@service-comms/client';
import { createConnectionWebsocketEffect } from '@service-connection/websocket';
import type { FromWebsocketMessage } from '@service-connection/websocket';
import { createEffect, createSignal, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { match } from 'ts-pattern';

type TypingMap = Map<string | null, Set<string>>;

function safeParse<T = any>(data: unknown): T | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

function addUser(prev: TypingMap, userId: string, threadId: string | null) {
  const next = new Map(prev);
  const set = next.get(threadId) ?? new Set<string>();
  next.set(threadId, new Set([...set, userId]));
  return next;
}

function removeUser(prev: TypingMap, userId: string, threadId: string | null) {
  const next = new Map(prev);
  const set = next.get(threadId);
  if (!set) return next;
  next.set(
    threadId,
    new Set(Array.from(set).filter((id) => id !== userId))
  );
  return next;
}

export function useChannelTypingRealtime(args: {
  channelId: Accessor<string | undefined>;
  currentUserId: Accessor<string | undefined>;
}) {
  const [usersTyping, setUsersTyping] = createSignal<TypingMap>(
    new Map([[null, new Set()]])
  );

  let currentChannelId = args.channelId();
  let currentUserId = args.currentUserId();

  createEffect(() => {
    currentChannelId = args.channelId();
    currentUserId = args.currentUserId();
  });

  const dispose = createConnectionWebsocketEffect((msg: FromWebsocketMessage) => {
    const activeChannel = currentChannelId;
    const me = currentUserId;
    if (!activeChannel || !me) return;

    if (msg.type !== 'comms_typing') return;
    const value = safeParse<any>(msg.data);
    if (!value || typeof value !== 'object') return;
    if (value.channel_id !== activeChannel) return;
    if (value.user_id === me) return;

    const threadId: string | null = value.thread_id ?? null;
    match(value.action)
      .with('start', () => setUsersTyping((prev) => addUser(prev, value.user_id, threadId)))
      .with('stop', () => setUsersTyping((prev) => removeUser(prev, value.user_id, threadId)))
      .otherwise(() => {});
  });

  onCleanup(() => dispose?.());

  const postTypingUpdate = async (params: {
    action: 'start' | 'stop';
    threadId?: string;
  }) => {
    const channelId = args.channelId();
    if (!channelId) return;
    await throwOnErr(
      async () =>
        await commsServiceClient.postTypingUpdate({
          channel_id: channelId,
          action: params.action,
          thread_id: params.threadId,
        })
    );
  };

  return { usersTyping, postTypingUpdate };
}


