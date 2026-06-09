import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { driveKeys } from './keys';

/**
 * Query for the children of a Drive folder. Pass an accessor returning the
 * parent folder id, or `null` for the user's Drive root. `enabled` gates the
 * request (e.g. only browse Drive while the import dialog is open).
 */
export function useGoogleDriveFoldersQuery(
  parentId: Accessor<string | null>,
  enabled?: Accessor<boolean>
) {
  return useQuery(() => ({
    queryKey: driveKeys.folders(parentId()).queryKey,
    enabled: enabled ? enabled() : true,
    queryFn: async () =>
      throwOnErr(
        async () =>
          await storageServiceClient.listGoogleDriveFiles({
            parentId: parentId() ?? undefined,
          })
      ),
  }));
}
