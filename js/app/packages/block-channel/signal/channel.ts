import type { ChannelData } from '@block-channel/definition';
import { withAnalytics } from '@coparse/analytics';
import { TrackingEvents } from '@coparse/analytics/src/types/TrackingEvents';
import { createBlockMemo, createBlockStore } from '@core/block';
import { useChannelsContext } from '@core/component/ChannelsProvider';
import {
  type InputAttachment,
  isStaticAttachmentType,
} from '@core/store/cacheChannelInput';
import { isErr } from '@core/util/maybeResult';
import { getImageDimensions, getVideoDimensions } from '@core/util/media';
import {
  forceRefetchChannel,
  upsertChannelMessageInCache,
} from '@queries/channel/channel';
import { useSendMessageMutation } from '@queries/channel/message';
import { commsServiceClient } from '@service-comms/client';
import type { NewAttachment } from '@service-comms/generated/models';
import type { Channel } from '@service-comms/generated/models/channel';
import type { ChannelParticipant } from '@service-comms/generated/models/channelParticipant';
import type { Message } from '@service-comms/generated/models/message';
import type { ParticipantAccess } from '@service-comms/generated/models/participantAccess';
import type { SimpleMention } from '@service-comms/generated/models/simpleMention';
import { useUserId } from '@service-gql/client';
import { blockNameToItemType } from '@service-storage/client';
import { createCallback } from '@solid-primitives/rootless';
import { toast } from 'core/component/Toast/Toast';
import type { Accessor } from 'solid-js';
import { initializeAttachments } from './attachment';
import { messageToReactionStore } from './reactions';
import {
  type MessageWithThreadId,
  type ThreadStoreData,
  threadsStore,
} from './threads';

const { track } = withAnalytics();

type ChannelStoreData = {
  messages: Message[];
  channel: Channel | undefined;
  participants: ChannelParticipant[];
  id: string | undefined;
  access: ParticipantAccess | undefined;
};

export const channelStore = createBlockStore<ChannelStoreData>({
  messages: [],
  channel: undefined,
  participants: [],
  id: undefined,
  access: undefined,
});

export const isChannelAdminOrOwnerMemo = createBlockMemo(() => {
  const channel = channelStore.get;
  if (!channel) return false;
  return (
    channel.access &&
    channel.access !== 'NoAccess' &&
    ['admin', 'owner'].includes(channel.access.Access.role)
  );
});

export function isValidChannelData(
  data: ChannelData
): data is Required<ChannelData> {
  if (!data.channel) return false;
  if (!data.channel.id) return false;
  if (!data.participants) return false;
  return true;
}

export function doesChannelRequireJoin(
  data: Required<ChannelData>,
  userId: string
) {
  return (
    data.channel.channel_type === 'public' &&
    data.participants.find((p) => p.user_id === userId) === undefined
  );
}

export async function refetchChannelData(channelId: string) {
  const initialize = createCallback(initializeChannelData);

  const res = await forceRefetchChannel(channelId);
  const data = isErr(res) ? undefined : res[1].channel;

  if (isErr(res) || !data || !isValidChannelData(data as ChannelData)) {
    toast.alert('Failed to refetch channel');
    return;
  }

  initialize(data as Required<ChannelData>);
}

/** Initializes all of the channel signals / stores
 * based on the block data passed in */
export function initializeChannelData(data: Required<ChannelData>) {
  const setChannelStore = channelStore.set;
  const setThreadsStore = threadsStore.set;
  const setMessageToReaction = messageToReactionStore.set;

  setChannelStore('id', data.channel.id);
  setChannelStore('participants', data.participants ?? []);
  setChannelStore('channel', data.channel);
  setChannelStore('access', data.access);

  const initialMessages = data.messages ?? [];

  // messages that are not a part of a thread
  const messages = initialMessages.filter((m: Message) => !m.thread_id);
  // All of the messages that are a part of the thread
  let messagesInThreads: MessageWithThreadId[] = initialMessages.filter(
    (m: Message) => !!m.thread_id
  ) as MessageWithThreadId[];

  let threads: ThreadStoreData = {};

  // correlate each message to the thread it belongs to
  for (let message of messagesInThreads) {
    let prevChildren = threads[message.thread_id] ?? [];
    threads[message.thread_id] = [...prevChildren, message];
  }

  setChannelStore('messages', messages);
  // Initialize map of message id -> reactions
  setMessageToReaction(data.reactions ?? {});
  setThreadsStore(threads);

  initializeAttachments(data.attachments ?? []);

  commsServiceClient.postActivity({
    activity_type: 'view',
    channel_id: data.channel.id,
  });
}

function optimisticChannelMessage({
  channelId,
  messageId,
  content,
  threadId,
  senderId,
}: {
  channelId: string;
  messageId: string;
  threadId?: string;
  content: string;
  senderId: string;
}) {
  const now = new Date().toISOString();

  const message: Message = {
    id: messageId,
    channel_id: channelId,
    content,
    sender_id: senderId,
    created_at: now,
    updated_at: now,
    thread_id: threadId,
  };

  // Source-of-truth is the channel query cache; block stores will follow via initializeChannelData effects.
  upsertChannelMessageInCache(channelId, message);
}

function isMessageSendable(
  content: string | undefined,
  attachments: InputAttachment[]
): boolean {
  return (content && content.trim().length > 0) || attachments.length > 0;
}

export type SendMessageArgs = {
  content: string | undefined;
  attachments: InputAttachment[];
  threadId?: string;
  mentions?: SimpleMention[];
};

export function useSendChannelMessageAction(channelID: Accessor<string>) {
  const optimisticSend = createCallback(optimisticChannelMessage);
  const channelsContext = useChannelsContext();
  const userId = useUserId();

  const mutation = useSendMessageMutation({
    onSettled() {
      channelsContext.refetchChannels();
    },
    onSuccess(_, variables) {
      const message = variables.message;
      track(TrackingEvents.BLOCKCHANNEL.MESSAGE.SEND, {
        channelId: variables.channelID,
        contentLength: message.content?.length ?? 0,
        attachmentsLength: message.attachments.length,
        inThread: message.thread_id !== undefined,
      });
    },
  });

  return async ({
    content,
    attachments,
    threadId,
    mentions,
  }: SendMessageArgs) => {
    if (!userId) return;
    if (!isMessageSendable(content, attachments)) return;

    const channelId = channelID();

    const attachmentsToSend = await Promise.allSettled(
      attachments.map(async (a) => {
        const attachmentType = isStaticAttachmentType(a.blockName)
          ? a.blockName
          : blockNameToItemType(a.blockName);

        if (!attachmentType) return;

        let attachment: NewAttachment = {
          entity_id: a.id,
          entity_type: attachmentType,
        };

        if (!a.file) return attachment;

        if (
          attachmentType !== 'static/image' &&
          attachmentType !== 'static/video'
        ) {
          return attachment;
        }

        const dimensions =
          attachmentType === 'static/image'
            ? await getImageDimensions(a.file)
            : await getVideoDimensions(a.file);

        attachment.width = dimensions.width;
        attachment.height = dimensions.height;

        return attachment;
      })
    );

    const filteredAttachements = attachmentsToSend
      .map((r) => (r.status === 'fulfilled' ? r.value : undefined))
      .filter((r) => r !== undefined);

    const data = await mutation.mutateAsync({
      channelID: channelId,
      message: {
        attachments: filteredAttachements,
        content: content ?? '',
        thread_id: threadId,
        mentions: mentions ?? [],
      },
    });

    optimisticSend({
      channelId,
      messageId: data.id,
      content: content ?? '',
      threadId,
      senderId: userId()!,
    });
  };
}

