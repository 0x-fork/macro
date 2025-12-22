import { throwOnErr } from '@core/util/maybeResult';
import { commsServiceClient } from '@service-comms/client';
import type { GetMentionsResponse } from '@service-comms/generated/models';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { channelKeys } from './keys';

export function useChannelMentionsQuery(channelId: Accessor<string | undefined>) {
  return useQuery(() => {
    const id = channelId();
    return {
      queryKey: channelKeys.mentions(id ?? '').queryKey,
      enabled: !!id,
      queryFn: async (): Promise<GetMentionsResponse> => {
        const res = await throwOnErr(
          async () => await commsServiceClient.getMentions({ channel_id: id! })
        );
        return (res ?? { mentions: [] }) as GetMentionsResponse;
      },
    };
  });
}


