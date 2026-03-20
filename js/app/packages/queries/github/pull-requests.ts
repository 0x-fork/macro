import {
  throwOnErr,
  catchToResult,
  isErr,
  ok,
  type MaybeResult,
} from '@core/util/maybeResult';
import type { PrEntity } from '@entity';
import { queryClient } from '@queries/client';
import { dssFetch } from '@service-storage/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { githubKeys } from './keys';
import {
  transformGithubPullRequestDetail,
  transformGithubPullRequestSummary,
  type GithubPullRequestDetailData,
  type GithubPullRequestDetailResponse,
  type GithubPullRequestSummaryResponse,
} from './transforms';

const GITHUB_PULL_REQUESTS_STALE_TIME = 5 * 60 * 1000;

type GithubPullRequestListResponse = {
  pull_requests: GithubPullRequestSummaryResponse[];
};

function githubPullRequestsQueryOptions() {
  return {
    queryKey: githubKeys.pullRequests.queryKey,
    queryFn: async (): Promise<PrEntity[]> => {
      const response = await throwOnErr(() =>
        dssFetch<GithubPullRequestListResponse>('/github/pull_requests')
      );

      return response.pull_requests.map(transformGithubPullRequestSummary);
    },
    staleTime: GITHUB_PULL_REQUESTS_STALE_TIME,
  };
}

function githubPullRequestQueryOptions(pullRequestId: string) {
  return {
    queryKey: githubKeys.pullRequest(pullRequestId).queryKey,
    queryFn: async (): Promise<GithubPullRequestDetailData> => {
      const response = await throwOnErr(() =>
        dssFetch<GithubPullRequestDetailResponse>(
          `/github/pull_requests/${encodeURIComponent(pullRequestId)}`
        )
      );

      return transformGithubPullRequestDetail(response);
    },
    staleTime: GITHUB_PULL_REQUESTS_STALE_TIME,
  };
}

export function useGithubPullRequestsQuery() {
  return useQuery(() => ({
    ...githubPullRequestsQueryOptions(),
    placeholderData: (prev) => prev,
  }));
}

export function useGithubPullRequestQuery(
  pullRequestId: Accessor<string>,
  options?: Accessor<{ enabled?: boolean }>
) {
  return useQuery(() => ({
    ...githubPullRequestQueryOptions(pullRequestId()),
    enabled: options?.()?.enabled ?? true,
    placeholderData: (prev) => prev,
  }));
}

export async function fetchAndCacheGithubPullRequest(
  pullRequestId: string
): Promise<MaybeResult<string, { pullRequest: GithubPullRequestDetailData }>> {
  const result = await catchToResult(() =>
    queryClient.ensureQueryData(githubPullRequestQueryOptions(pullRequestId))
  );

  if (isErr(result)) {
    return result;
  }

  return ok({ pullRequest: result[1] });
}
