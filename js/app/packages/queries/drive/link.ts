import { throwOnErr } from '@core/util/result';
import { authServiceClient } from '@service-auth/client';
import { useMutation, useQuery } from '@tanstack/solid-query';
import { useQueryClient } from '../client';
import { driveKeys } from './keys';

/** Query for the user's Google Drive connection status. */
export function useGoogleDriveLinkStatusQuery() {
  return useQuery(() => ({
    queryKey: driveKeys.connectionStatus.queryKey,
    queryFn: async () =>
      throwOnErr(
        async () => await authServiceClient.checkGoogleDriveLinkStatus()
      ),
  }));
}

/**
 * Mutation that asks auth-service for the Google OAuth authorization URL.
 * Callers consume `authorization_url` and navigate the browser to it.
 */
export function useInitGoogleDriveLink() {
  return useMutation(() => ({
    mutationFn: async (originalUrl: string) =>
      authServiceClient.initGoogleDriveLink(originalUrl),
  }));
}

/** Mutation that persists the Drive link after the OAuth callback returns. */
export function useFinalizeGoogleDriveLink() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: async () =>
      throwOnErr(async () => await authServiceClient.finalizeGoogleDriveLink()),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: driveKeys.connectionStatus.queryKey,
      });
    },
  }));
}

/** Mutation that disconnects then re-initiates the Drive link ("Reconnect"). */
export function useReauthenticateGoogleDrive() {
  return useMutation(() => ({
    mutationFn: async (originalUrl: string) =>
      authServiceClient.reauthenticateGoogleDrive(originalUrl),
  }));
}

/** Mutation that disconnects the user's Google Drive account. */
export function useDisconnectGoogleDrive() {
  const queryClient = useQueryClient();
  return useMutation(() => ({
    mutationFn: async () =>
      throwOnErr(async () => await authServiceClient.deleteGoogleDriveLink()),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: driveKeys.connectionStatus.queryKey,
      });
    },
  }));
}
