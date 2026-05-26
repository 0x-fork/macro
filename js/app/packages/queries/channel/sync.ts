import type { ApiThreadReply } from '@service-comms/client';
import type {
  Attachment as ApiAttachment,
  Message as ApiMessage,
  CountedReaction,
} from '@service-comms/generated/models';
import { z } from 'zod';
import { consumeNonce } from '../nonce';
import { ChannelNonceKeys } from './keys';
import {
  getTargetMessageState,
  insertMessageIntoTargetCaches,
  removeMessageFromTargetCaches,
  replaceTargetAttachments,
  replaceTargetMessageState,
  replaceTargetReactions,
  resolveMessageTarget,
  softInvalidateTargetCaches,
} from './reconcile';

/**
 * Websocket payload types
 */
type CommsMessagePayload = ApiMessage & { channel_id: string; nonce: string };

type CommsReactionPayload = {
  channel_id: string;
  message_id: string;
  reactions: CountedReaction[];
  nonce: string;
};

type CommsAttachmentPayload = {
  channel_id: string;
  message_id: string;
  attachments: ApiAttachment[];
  nonce: string;
};

export const commsMessagePayloadSchema = z
  .object({
    channel_id: z.string(),
    content: z.string(),
    created_at: z.string(),
    deleted_at: z.string().nullable().optional(),
    edited_at: z.string().nullable().optional(),
    id: z.string(),
    nonce: z.string(),
    sender_id: z.string(),
    thread_id: z.string().nullable().optional(),
    updated_at: z.string(),
  })
  .passthrough() satisfies z.ZodType<CommsMessagePayload>;

const countedReactionSchema = z
  .object({
    emoji: z.string(),
    users: z.array(z.string()),
  })
  .passthrough() satisfies z.ZodType<CountedReaction>;

export const commsReactionPayloadSchema = z
  .object({
    channel_id: z.string(),
    message_id: z.string(),
    nonce: z.string(),
    reactions: z.array(countedReactionSchema),
  })
  .passthrough() satisfies z.ZodType<CommsReactionPayload>;

const commsAttachmentSchema = z
  .object({
    channel_id: z.string(),
    created_at: z.string(),
    entity_id: z.string(),
    entity_type: z.string(),
    height: z.number().nullable().optional(),
    id: z.string(),
    message_id: z.string(),
    width: z.number().nullable().optional(),
  })
  .passthrough() satisfies z.ZodType<ApiAttachment>;

export const commsAttachmentPayloadSchema = z
  .object({
    attachments: z.array(commsAttachmentSchema),
    channel_id: z.string(),
    message_id: z.string(),
    nonce: z.string(),
  })
  .passthrough() satisfies z.ZodType<CommsAttachmentPayload>;

/**
 * Handle incoming message from websocket.
 *
 * If the nonce was registered by this client (optimistic update), we skip the cache
 * update since it was already applied. Otherwise, this is an external update
 * (other user, other tab, or server-initiated) and we apply it to the cache.
 *
 * We always call softInvalidateTargetCaches to ensure eventual consistency:
 * - Marks query as stale for background refetch when component remounts
 * - Handles cross-tab sync where optimistic state may differ
 * - Catches edge cases like server-side message modifications
 */
export function handleCommsMessage(payload: CommsMessagePayload): void {
  const isExternalUpdate = !consumeNonce(
    ChannelNonceKeys.MESSAGE,
    payload.nonce
  );

  if (isExternalUpdate) {
    try {
      if (payload.deleted_at) {
        removeMessageFromTargetCaches(
          payload.channel_id,
          resolveMessageTarget({
            channelId: payload.channel_id,
            messageId: payload.id,
            threadId: payload.thread_id ?? undefined,
          })
        );
      } else {
        const target = resolveMessageTarget({
          channelId: payload.channel_id,
          messageId: payload.id,
          threadId: payload.thread_id ?? undefined,
        });
        const existingState = getTargetMessageState(payload.channel_id, target);

        if (existingState) {
          replaceTargetMessageState(payload.channel_id, target, {
            content: payload.content,
            editedAt: payload.edited_at,
            updatedAt: payload.updated_at,
            attachments: existingState.attachments,
          });
        } else if (target.kind === 'thread_reply') {
          const reply: ApiThreadReply = {
            id: payload.id,
            sender_id: payload.sender_id,
            content: payload.content,
            created_at: payload.created_at,
            updated_at: payload.updated_at,
            edited_at: payload.edited_at,
            attachments: [],
            reactions: [],
          };
          insertMessageIntoTargetCaches(payload.channel_id, target, reply);
        } else {
          insertMessageIntoTargetCaches(payload.channel_id, target, {
            id: payload.id,
            channel_id: payload.channel_id,
            sender_id: payload.sender_id,
            content: payload.content,
            created_at: payload.created_at,
            updated_at: payload.updated_at,
            edited_at: payload.edited_at,
            attachments: [],
            reactions: [],
            thread: {
              preview: [],
              reply_count: 0,
              latest_reply_at: null,
            },
          });
        }
      }
    } catch (error) {
      console.error('Failed to update message cache from websocket:', error);
    }
  }

  softInvalidateTargetCaches(
    payload.channel_id,
    resolveMessageTarget({
      channelId: payload.channel_id,
      messageId: payload.id,
      threadId: payload.thread_id ?? undefined,
    })
  );
}

/**
 * Handle reaction update from websocket.
 * Updates the cache directly with the new reaction state.
 *
 * Soft invalidation ensures eventual consistency across tabs/devices.
 */
export function handleCommsReaction(payload: CommsReactionPayload): void {
  const isExternalUpdate = !consumeNonce(
    ChannelNonceKeys.REACTION,
    payload.nonce
  );

  const target = resolveMessageTarget({
    channelId: payload.channel_id,
    messageId: payload.message_id,
  });

  if (isExternalUpdate) {
    try {
      replaceTargetReactions(payload.channel_id, target, payload.reactions);
    } catch (error) {
      console.error('Failed to update reaction cache from websocket:', error);
    }
  }

  softInvalidateTargetCaches(payload.channel_id, target);
}

/**
 * Handle attachment update from websocket.
 * Updates the cache directly with the new attachments.
 *
 * Soft invalidation ensures eventual consistency across tabs/devices.
 */
export function handleCommsAttachment(payload: CommsAttachmentPayload): void {
  const target = resolveMessageTarget({
    channelId: payload.channel_id,
    messageId: payload.message_id,
  });

  try {
    replaceTargetAttachments(payload.channel_id, target, payload.attachments);
  } catch (error) {
    console.error('Failed to update attachment cache from websocket:', error);
  }
  softInvalidateTargetCaches(payload.channel_id, target);
}
