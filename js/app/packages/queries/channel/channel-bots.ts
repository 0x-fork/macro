import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { storageServiceClient } from '@service-storage/client';
import type { CreateChannelScopedBotRequest } from '@service-storage/generated/schemas/createChannelScopedBotRequest';
import type { CreateChannelScopedBotResponse } from '@service-storage/generated/schemas/createChannelScopedBotResponse';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { channelKeys } from './keys';

export type CreateChannelScopedBotParams = CreateChannelScopedBotRequest & {
  channelId: string;
};

export type BotChannelsParams = {
  botId: string;
};

export function useBotChannelsQuery(params: () => BotChannelsParams) {
  return useQuery(() => {
    const { botId } = params();
    return {
      queryKey: channelKeys.botChannels(botId).queryKey,
      queryFn: async () =>
        await throwOnErr(() =>
          storageServiceClient.getBotChannels({ bot_id: botId })
        ),
    };
  });
}

export function invalidateBotChannels(botId: string) {
  return queryClient.invalidateQueries({
    queryKey: channelKeys.botChannels(botId).queryKey,
  });
}

/**
 * Create a bot scoped to a channel, add it to the channel, and mint its webhook token.
 */
export function useCreateChannelScopedBotMutation(
  callbacks?: MutationCallbacks<
    CreateChannelScopedBotResponse,
    Error,
    CreateChannelScopedBotParams,
    undefined
  >
) {
  return useMutation(() => ({
    gcTime: 0,
    mutationFn: async (vars: CreateChannelScopedBotParams) => {
      const { channelId, ...request } = vars;
      return await throwOnErr(() =>
        storageServiceClient.createChannelScopedBot({
          ...request,
          channel_id: channelId,
        })
      );
    },
    ...withCallbacks<
      CreateChannelScopedBotResponse,
      Error,
      CreateChannelScopedBotParams,
      undefined
    >(
      {
        onSuccess: (data, vars) => {
          void queryClient.invalidateQueries({
            queryKey: channelKeys.participants(vars.channelId).queryKey,
          });
          void invalidateBotChannels(data.bot.id);
        },
        onError(error) {
          console.error('failed to create channel-scoped bot', error);
        },
      },
      callbacks
    ),
  }));
}
