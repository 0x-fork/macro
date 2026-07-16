import { createQueryKeys } from '@lukemorales/query-key-factory';

export const documentationKeys = createQueryKeys('documentation', {
  availability: null,
  sites: null,
  site: (siteId: string) => [siteId],
});
