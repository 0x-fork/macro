import { throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import { storageServiceClient } from '@service-storage/client';
import type { Bot } from '@service-storage/generated/schemas/bot';
import { useQuery } from '@tanstack/solid-query';
import { botKeys } from './keys';

export type BotChannelsParams = {
  botId: string;
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
