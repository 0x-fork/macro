import { throwOnErr } from '@core/util/result';
import {
  type DriveImportRequest,
  storageServiceClient,
} from '@service-storage/client';
import { useMutation } from '@tanstack/solid-query';

/** Mutation that imports the selected Drive files/folders into Macro. */
export function useImportFromGoogleDrive() {
  return useMutation(() => ({
    mutationFn: async (request: DriveImportRequest) =>
      throwOnErr(
        async () => await storageServiceClient.importFromGoogleDrive(request)
      ),
  }));
}
