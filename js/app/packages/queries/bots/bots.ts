import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { storageServiceClient } from '@service-storage/client';
import type { Bot } from '@service-storage/generated/schemas/bot';
import type { BotToken } from '@service-storage/generated/schemas/botToken';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { botKeys } from './keys';

export type BotChannelsParams = {
  botId: string;
};

export type CreateBotWithTokenParams = {
  teamId?: string;
  name: string;
  handle: string;
  description?: string;
  avatarUrl?: string;
  tokenLabel?: string;
  tokenExpiresAt?: string;
};

export type CreateBotWithTokenResponse = {
  bot: Bot;
  token: BotToken;
  bot_token: string;
};

export function useBotsQuery() {
  return useQuery(() => ({
    queryKey: botKeys.list.queryKey,
    queryFn: async (): Promise<Bot[]> =>
      await throwOnErr(() => storageServiceClient.getBots()),
  }));
}

export function invalidateBots() {
  return queryClient.invalidateQueries({
    queryKey: botKeys.list.queryKey,
  });
}

export function useCreateBotWithTokenMutation() {
  return useMutation(() => ({
    gcTime: 0,
    mutationFn: async (
      vars: CreateBotWithTokenParams
    ): Promise<CreateBotWithTokenResponse> => {
      const bot = await throwOnErr(() =>
        storageServiceClient.createBot({
          avatar_url: vars.avatarUrl,
          description: vars.description,
          handle: vars.handle,
          name: vars.name,
          team_id: vars.teamId,
        })
      );
      const tokenResponse = await throwOnErr(() =>
        storageServiceClient.createBotToken({
          bot_id: bot.id,
          expires_at: vars.tokenExpiresAt,
          label: vars.tokenLabel,
        })
      );

      return {
        bot,
        token: tokenResponse.token,
        bot_token: tokenResponse.bearer_token,
      };
    },
    onSuccess: () => {
      void invalidateBots();
    },
    onError(error) {
      console.error('failed to create bot with token', error);
    },
  }));
}

export function useBotChannelsQuery(params: () => BotChannelsParams) {
  return useQuery(() => {
    const { botId } = params();
    return {
      queryKey: botKeys.channels(botId).queryKey,
      queryFn: async () =>
        await throwOnErr(() =>
          storageServiceClient.getBotChannels({ bot_id: botId })
        ),
    };
  });
}

export function invalidateBotChannels(botId: string) {
  return queryClient.invalidateQueries({
    queryKey: botKeys.channels(botId).queryKey,
  });
}
