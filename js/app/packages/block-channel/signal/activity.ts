import { createBlockSignal } from '@core/block';
import {
  useChannelsContext,
  useLatestActivityForChannel,
} from '@core/component/ChannelsProvider';
import { postChannelActivity } from '@queries/channel/activity';
import type { Activity as ChannelActivity } from '@service-comms/generated/models/activity';

import { channelStore } from './channel';

export const latestActivitySignal = createBlockSignal<ChannelActivity>();
export const openedChannelSignal = createBlockSignal<Date>();

export async function updateActivityOnChannelOpen() {
  const channel = channelStore.get;
  const channelId = channel?.channel?.id;
  if (!channelId) return;

  const channelsContext = useChannelsContext();

  const latestActivity = useLatestActivityForChannel(channelId);

  const setLatestActivity = latestActivitySignal.set;
  const setOpenedChannel = openedChannelSignal.set;

  const lastActivity = latestActivity();

  if (lastActivity) {
    setLatestActivity(lastActivity);
  }

  setOpenedChannel(new Date());

  await postChannelActivity({ channelID: channelId, activityType: 'view' });

  channelsContext.refetchActivity();
}

export async function updateActivityOnChannelClose() {
  const channel = channelStore.get;
  const channelId = channel?.channel?.id;
  if (!channelId) return;

  await postChannelActivity({ channelID: channelId, activityType: 'view' });
}

export async function updateActivityOnMessageReceived(
  incomingChannelId: string
) {
  const channelsContext = useChannelsContext();
  const channel = channelStore.get;
  const channelId = channel?.channel?.id;
  if (!channelId || channelId === incomingChannelId) return;
  channelsContext.refetchActivity();
}

export async function updateActivityOnMessageSend() {
  const channelsContext = useChannelsContext();
  channelsContext.refetchActivity();
}
