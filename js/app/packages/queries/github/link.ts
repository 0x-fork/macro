import { isOk } from '@core/util/maybeResult';
import { queryClient } from '@queries/client';
import { authServiceClient } from '@service-auth/client';
import { useQuery } from '@tanstack/solid-query';
import { githubKeys } from './keys';

const LINK_STALE_TIME = 5 * 60 * 1000;

export function useGitHubLinksQuery() {
  return useQuery(() => ({
    queryKey: githubKeys.links.queryKey,
    queryFn: async () => {
      const response = await authServiceClient.listGithubLinks();
      if (isOk(response)) {
        return response[1];
      }
      throw new Error(`Failed to fetch GitHub links`);
    },
    staleTime: LINK_STALE_TIME,
    refetchOnWindowFocus: 'always',
  }));
}

export function invalidateGitHubLinks() {
  queryClient.cancelQueries({ queryKey: githubKeys.links.queryKey });
  queryClient.invalidateQueries({
    queryKey: githubKeys.links.queryKey,
  });
}
