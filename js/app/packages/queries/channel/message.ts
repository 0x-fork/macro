import { throwOnErr } from '@core/util/maybeResult';
import { nanoid } from 'nanoid';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { invalidateChannelWithID } from '@queries/channel/channel';
import {
  commsServiceClient,
  type IdResponse,
  type MessageResponse,
} from '@service-comms/client';
import type { PostMessageRequest } from '@service-comms/generated/models';
import type { Message } from '@service-comms/generated/models/message';
import { useMutation } from '@tanstack/solid-query';
import { replaceChannelMessageIdInCache, upsertChannelMessageInCache } from './channel';

type WithChannelID<T> = T & { channelID: string };

type SendMessageParams = WithChannelID<{
  message: PostMessageRequest;
  senderID: string;
}>;

type SendMessageContext = {
  optimisticId: string;
};

/**
 * Mutation to send an channel message.
 */
export function useSendMessageMutation(
  callbacks?: MutationCallbacks<IdResponse, Error, SendMessageParams, SendMessageContext>
) {
  return useMutation(() => ({
    mutationFn: async (vars: SendMessageParams) => {
      return await throwOnErr(
        async () =>
          await commsServiceClient.postMessage({
            channel_id: vars.channelID,
            message: vars.message,
          })
      );
    },
    ...withCallbacks<IdResponse, Error, SendMessageParams, SendMessageContext>(
      {
        onMutate: async (vars) => {
          const optimisticId = `tmp_${nanoid(10)}`;
          const now = new Date().toISOString();

          const optimisticMessage: Message = {
            id: optimisticId,
            channel_id: vars.channelID,
            content: vars.message.content ?? '',
            sender_id: vars.senderID,
            created_at: now,
            updated_at: now,
            thread_id: vars.message.thread_id,
          };

          upsertChannelMessageInCache(vars.channelID, optimisticMessage);
          return { optimisticId };
        },
        onError(error) {
          console.error('failed to send message', error);
        },
        onSuccess(data, variables, context) {
          // Replace temp id with server id; websocket will reconcile canonical content.
          if (context?.optimisticId) {
            replaceChannelMessageIdInCache(
              variables.channelID,
              context.optimisticId,
              data.id
            );
          }
        },
      },
      callbacks
    ),
  }));
}

type DeleteMessageParams = { channelID: string; messageID: string };

/**
 * Mutation to delete a channel message
 */
export function useDeleteMessageMutation(
  callbacks?: MutationCallbacks<void, Error, DeleteMessageParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: DeleteMessageParams) => {
      await throwOnErr(
        async () =>
          await commsServiceClient.deleteMessage({
            channel_id: vars.channelID,
            message_id: vars.messageID,
          })
      );
    },
    ...withCallbacks<void, Error, DeleteMessageParams>(
      {
        onError(error) {
          console.error('failed to delete message', error);
        },
        onSettled: (_data, _error, variables) => {
          invalidateChannelWithID(variables.channelID);
        },
      },
      callbacks
    ),
  }));
}

type PatchMessageParams = {
  channelID: string;
  messageID: string;
  content: string;
};

/**
 * Mutation to patch a channel message
 */
export function usePatchMessageMutation(
  callbacks?: MutationCallbacks<MessageResponse, Error, PatchMessageParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: PatchMessageParams) => {
      return await throwOnErr(
        async () =>
          await commsServiceClient.patchMessage({
            channel_id: vars.channelID,
            message_id: vars.messageID,
            content: vars.content,
          })
      );
    },
    ...withCallbacks<MessageResponse, Error, PatchMessageParams>(
      {
        onError(error) {
          console.error('failed to update message', error);
        },
        onSettled: (_data, _error, variables) => {
          invalidateChannelWithID(variables.channelID);
        },
      },
      callbacks
    ),
  }));
}

type DeleteMessageAttachmentParams = {
  channelID: string;
  messageID: string;
  attachmentID: string;
  content?: string;
};

/**
 * Mutation to delete an attachment from a message.
 */
export function useDeleteMessageAttachmentMutation(
  callbacks?: MutationCallbacks<MessageResponse, Error, DeleteMessageAttachmentParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: DeleteMessageAttachmentParams) => {
      return await throwOnErr(
        async () =>
          await commsServiceClient.patchMessage({
            channel_id: vars.channelID,
            message_id: vars.messageID,
            content: vars.content,
            attachment_ids_to_delete: [vars.attachmentID],
          })
      );
    },
    ...withCallbacks<MessageResponse, Error, DeleteMessageAttachmentParams>(
      {
        onError(error) {
          console.error('failed to delete attachment', error);
        },
        onSettled: (_data, _error, variables) => {
          invalidateChannelWithID(variables.channelID);
        },
      },
      callbacks
    ),
  }));
}
