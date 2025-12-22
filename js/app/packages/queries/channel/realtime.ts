import { createConnectionWebsocketEffect } from '@service-connection/websocket';
import type { FromWebsocketMessage } from '@service-connection/websocket';
import { createEffect, onCleanup } from 'solid-js';
import type { Accessor } from 'solid-js';
import { match } from 'ts-pattern';
import type { Attachment } from '@service-comms/generated/models/attachment';
import type { CountedReaction } from '@service-comms/generated/models/countedReaction';
import type { Message } from '@service-comms/generated/models/message';
import {
  mergeChannelAttachmentsInCache,
  replaceChannelMessageAttachmentsInCache,
  setChannelMessageReactionsInCache,
  upsertChannelMessageInCache,
} from './channel';

function safeParseJson(data: unknown): unknown | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object';
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((v) => typeof v === 'string');
}

function isCountedReaction(x: unknown): x is CountedReaction {
  if (!isRecord(x)) return false;
  return isString(x.emoji) && isStringArray(x.users);
}

function isCountedReactionArray(x: unknown): x is CountedReaction[] {
  return Array.isArray(x) && x.every(isCountedReaction);
}

function isAttachment(x: unknown): x is Attachment {
  if (!isRecord(x)) return false;
  return (
    isString(x.id) &&
    isString(x.channel_id) &&
    isString(x.message_id) &&
    isString(x.entity_id) &&
    isString(x.entity_type) &&
    isString(x.created_at)
  );
}

function isAttachmentArray(x: unknown): x is Attachment[] {
  return Array.isArray(x) && x.every(isAttachment);
}

function isMessage(x: unknown): x is Message {
  if (!isRecord(x)) return false;
  // Validate required Message fields. Optional fields are allowed to be absent.
  return (
    isString(x.id) &&
    isString(x.channel_id) &&
    isString(x.sender_id) &&
    isString(x.content) &&
    isString(x.created_at) &&
    isString(x.updated_at)
  );
}

type ChannelWsEvent =
  | Readonly<{ type: 'comms_message'; message: Message }>
  | Readonly<{
      type: 'comms_reaction_update';
      messageID: string;
      reactions: CountedReaction[];
    }>
  | Readonly<{
      type: 'comms_attachment';
      messageID?: string;
      attachments: Attachment[];
    }>;

function decodeChannelWsEvent(
  msg: FromWebsocketMessage,
  activeChannelId: string
): ChannelWsEvent | undefined {
  const raw = safeParseJson(msg.data);
  if (!isRecord(raw)) return undefined;
  if (raw.channel_id !== activeChannelId) return undefined;

  return match(msg.type)
    .with('comms_message', () => {
      if (!isMessage(raw)) return undefined;
      return { type: 'comms_message', message: raw };
    })
    .with('comms_reaction', 'comms_reaction_update', () => {
      if (!isString(raw.message_id)) return undefined;
      if (!isCountedReactionArray(raw.reactions)) return undefined;
      return {
        type: 'comms_reaction_update',
        messageID: raw.message_id,
        reactions: raw.reactions,
      };
    })
    .with('comms_attachment', () => {
      if (!isAttachmentArray(raw.attachments)) return undefined;
      const messageID = isString(raw.message_id) ? raw.message_id : undefined;
      return {
        type: 'comms_attachment',
        messageID,
        attachments: raw.attachments,
      };
    })
    .otherwise(() => undefined);
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

    const event = decodeChannelWsEvent(msg, activeId);
    if (!event) return;

    match(event)
      .with({ type: 'comms_message' }, (e) => {
        upsertChannelMessageInCache(activeId, e.message);
      })
      .with({ type: 'comms_reaction_update' }, (e) => {
        setChannelMessageReactionsInCache(activeId, e.messageID, e.reactions);
      })
      .with({ type: 'comms_attachment' }, (e) => {
        if (e.messageID) {
          replaceChannelMessageAttachmentsInCache(
            activeId,
            e.messageID,
            e.attachments
          );
        } else {
          mergeChannelAttachmentsInCache(activeId, e.attachments);
        }
      })
      .exhaustive();
  });

  onCleanup(() => dispose?.());
}


