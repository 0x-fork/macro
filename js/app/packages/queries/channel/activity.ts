import { throwOnErr } from '@core/util/maybeResult';
import { commsServiceClient } from '@service-comms/client';

export type ChannelActivityType = 'view';

export async function postChannelActivity(args: {
  channelID: string;
  activityType: ChannelActivityType;
}) {
  return await throwOnErr(
    async () =>
      await commsServiceClient.postActivity({
        channel_id: args.channelID,
        activity_type: args.activityType,
      })
  );
}


