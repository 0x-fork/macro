import { throwOnErr } from '@core/util/result';
import { invalidateBotChannels, invalidateBots } from '@queries/bots/bots';
import { queryClient } from '@queries/client';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { storageServiceClient } from '@service-storage/client';
import type { Bot } from '@service-storage/generated/schemas/bot';
import type { CreateChannelScopedBotRequest } from '@service-storage/generated/schemas/createChannelScopedBotRequest';
import type { CreateChannelScopedBotResponse } from '@service-storage/generated/schemas/createChannelScopedBotResponse';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { channelKeys } from './keys';

export type CreateChannelScopedBotParams = CreateChannelScopedBotRequest & {
  channelId: string;
};

export type ChannelBotsParams = {
  channelId: string;
};

export type AddBotToChannelParams = {
  channelId: string;
  botId: string;
};

export function useChannelBotsQuery(params: () => ChannelBotsParams) {
  return useQuery(() => {
    const { channelId } = params();
    return {
      queryKey: channelKeys.channelBots(channelId).queryKey,
      queryFn: async (): Promise<Bot[]> =>
        await throwOnErr(() =>
          storageServiceClient.getChannelBots({ channel_id: channelId })
        ),
    };
  });
}

export function invalidateChannelBots(channelId: string) {
  return queryClient.invalidateQueries({
    queryKey: channelKeys.channelBots(channelId).queryKey,
  });
}

export function useAddBotToChannelMutation(
  callbacks?: MutationCallbacks<void, Error, AddBotToChannelParams, undefined>
) {
  return useMutation(() => ({
    gcTime: 0,
    mutationFn: async (vars: AddBotToChannelParams) => {
      await throwOnErr(() =>
        storageServiceClient.addBotToChannel({
          channel_id: vars.channelId,
          bot_id: vars.botId,
        })
      );
    },
    ...withCallbacks<void, Error, AddBotToChannelParams, undefined>(
      {
        onSuccess: (_data, vars) => {
          void queryClient.invalidateQueries({
            queryKey: channelKeys.participants(vars.channelId).queryKey,
          });
          void invalidateBotChannels(vars.botId);
          void invalidateChannelBots(vars.channelId);
        },
        onError(error) {
          console.error('failed to add bot to channel', error);
        },
      },
      callbacks
    ),
  }));
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
          void invalidateBots();
          void invalidateBotChannels(data.bot.id);
          void invalidateChannelBots(vars.channelId);
        },
        onError(error) {
          console.error('failed to create channel-scoped bot', error);
        },
      },
      callbacks
    ),
  }));
}
