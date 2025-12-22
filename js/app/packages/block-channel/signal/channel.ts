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
import { forceRefetchChannel } from '@queries/channel/channel';
import { useSendMessageMutation } from '@queries/channel/message';
import type { NewAttachment } from '@service-comms/generated/models';
import type { Channel } from '@service-comms/generated/models/channel';
import type { ChannelParticipant } from '@service-comms/generated/models/channelParticipant';
import type { ParticipantAccess } from '@service-comms/generated/models/participantAccess';
import type { SimpleMention } from '@service-comms/generated/models/simpleMention';
import { useUserId } from '@service-gql/client';
import { blockNameToItemType } from '@service-storage/client';
import { createCallback } from '@solid-primitives/rootless';
import { toast } from 'core/component/Toast/Toast';
import type { Accessor } from 'solid-js';
import { initializeAttachments } from './attachment';
import {
} from './threads';

const { track } = withAnalytics();

type ChannelStoreData = {
  channel: Channel | undefined;
  participants: ChannelParticipant[];
  id: string | undefined;
  access: ParticipantAccess | undefined;
};

export const channelStore = createBlockStore<ChannelStoreData>({
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
  data: Required<ChannelData>
) {
  // Prefer the server-provided access union over scanning participants.
  // If the user isn't a participant in a public channel, access is typically 'NoAccess'.
  return data.channel.channel_type === 'public' && data.access === 'NoAccess';
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

  setChannelStore('id', data.channel.id);
  setChannelStore('participants', data.participants ?? []);
  setChannelStore('channel', data.channel);
  setChannelStore('access', data.access);

  initializeAttachments(data.attachments ?? []);
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

    await mutation.mutateAsync({
      channelID: channelId,
      senderID: userId()!,
      message: {
        attachments: filteredAttachements,
        content: content ?? '',
        thread_id: threadId,
        mentions: mentions ?? [],
      },
    });
  };
}

