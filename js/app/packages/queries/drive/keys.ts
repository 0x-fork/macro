import { createQueryKeys } from '@lukemorales/query-key-factory';

export const driveKeys = createQueryKeys('drive', {
  connectionStatus: null,
  folders: (parentId: string | null) => ({
    queryKey: [parentId ?? 'root'],
  }),
});
