import { createQueryKeys } from '@lukemorales/query-key-factory';
import type { SoupQueryArgs } from '@queries/soup/soup';

export const soupKeys = createQueryKeys('soup', {
  items: (args: SoupQueryArgs) => ({
    queryKey: [args],
  }),
});
