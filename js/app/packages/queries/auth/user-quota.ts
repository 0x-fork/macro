import { isOk } from '@core/util/maybeResult';
import { authServiceClient } from '@service-auth/client';
import type { UserQuota } from '@service-auth/generated/schemas';
import { useQuery } from '@tanstack/solid-query';
import { queryClient } from '../client';
import { authKeys } from './keys';

const USER_QUOTA_STALE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Fetches the user's quota information.
 * Returns the UserQuota data or throws an error if the request fails.
 */
const getUserQuota = async (): Promise<UserQuota> => {
  const result = await authServiceClient.userQuota();

  if (isOk(result)) {
    const [, quota] = result;
    return quota;
  }

  const [error] = result;
  const [{ code, message }] = error;
  console.error('Error getting user quota', error);
  throw new Error(`Failed to get user quota: ${code} - ${message}`);
};

function userQuotaQueryOptions() {
  return {
    queryKey: authKeys.userQuota.queryKey,
    queryFn: getUserQuota,
    staleTime: USER_QUOTA_STALE_TIME,
    throwOnError: false,
    retry: 1,
    retryOnMount: false,
  };
}

/**
 * Invalidates the user quota query cache.
 * Useful for refreshing quota data after mutations that might affect it (e.g., sending AI chat messages).
 */
export function invalidateUserQuota() {
  return queryClient.invalidateQueries({
    queryKey: authKeys.userQuota.queryKey,
  });
}
