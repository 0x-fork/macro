import { createConnectionWebsocketEffect } from '@service-connection/websocket';
import type { FromWebsocketMessage } from '@service-connection/websocket';
import { createEffect, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { match } from 'ts-pattern';
import {
  mergeChannelAttachmentsInCache,
  replaceChannelMessageAttachmentsInCache,
  setChannelMessageReactionsInCache,
  upsertChannelMessageInCache,
} from './channel';

function safeParse<T = any>(data: unknown): T | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

/**
 * Subscribe to connection-gateway websocket events and patch the channel query cache.
 *
 * This keeps websocket/server-state logic close to the query layer, and avoids deprecated
 * block websocket effects.
 */
export function useChannelRealtime(channelId: Accessor<string | undefined>) {
  let currentChannelId: string | undefined = channelId();

  createEffect(() => {
    currentChannelId = channelId();
  });

  const dispose = createConnectionWebsocketEffect((msg: FromWebsocketMessage) => {
    const activeId = currentChannelId;
    if (!activeId) return;

    const value = safeParse<any>(msg.data);
    if (!value || typeof value !== 'object') return;

    const targetChannelId = value.channel_id;
    if (targetChannelId !== activeId) return;

    match(msg.type)
      .with('comms_message', () => {
        upsertChannelMessageInCache(activeId, value);
      })
      .with('comms_reaction', 'comms_reaction_update', () => {
        if (!value.message_id || !Array.isArray(value.reactions)) return;
        setChannelMessageReactionsInCache(
          activeId,
          value.message_id,
          value.reactions
        );
      })
      .with('comms_attachment', () => {
        const attachments = value.attachments;
        if (!Array.isArray(attachments)) return;
        const messageId = value.message_id;
        if (messageId) {
          replaceChannelMessageAttachmentsInCache(activeId, messageId, attachments);
        } else {
          mergeChannelAttachmentsInCache(activeId, attachments);
        }
      })
      .otherwise(() => {});
  });

  onCleanup(() => dispose?.());
}


