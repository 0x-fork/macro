import { createQueryKeys } from '@lukemorales/query-key-factory';

export const authKeys = createQueryKeys('auth', {
  apiToken: null,
  profilePicture: (params: { id: string }) => ({
    queryKey: [params],
  }),
});
