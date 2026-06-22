import { createQueryKeys } from '@lukemorales/query-key-factory';

export const botKeys = createQueryKeys('bots', {
  list: null,
  channels: (botID: string) => ({
    queryKey: [botID],
  }),
});
