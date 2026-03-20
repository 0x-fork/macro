import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { isErr, ok } from '@core/util/maybeResult';
import { fetchAndCacheGithubPullRequest } from '@queries/github/pull-requests';
import { lazy } from 'solid-js';

export const definition = defineBlock({
  name: 'pr',
  description: 'View GitHub pull requests',
  component: lazy(() => import('./component/Block')),
  liveTrackingEnabled: false,
  syncServiceEnabled: false,

  async load(source) {
    if (source.type !== 'dss') {
      return LoadErrors.INVALID;
    }

    const pullRequest = await fetchAndCacheGithubPullRequest(source.id);

    if (isErr(pullRequest)) {
      if (isErr(pullRequest, 'NOT_FOUND')) {
        return LoadErrors.MISSING;
      }
      if (isErr(pullRequest, 'UNAUTHORIZED')) {
        return LoadErrors.UNAUTHORIZED;
      }
      if (isErr(pullRequest, 'GONE')) {
        return LoadErrors.GONE;
      }

      return LoadErrors.INVALID;
    }

    return ok(pullRequest[1].pullRequest);
  },
  accepted: {},
});

export type PrData = ExtractLoadType<(typeof definition)['load']>;
