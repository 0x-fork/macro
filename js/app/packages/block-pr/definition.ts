import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { ok } from 'neverthrow';
import { lazy } from 'solid-js';

export const definition = defineBlock({
  name: 'pr',
  description: 'View GitHub pull requests',
  defaultFilename: 'Pull Request',
  component: lazy(() => import('./component/Block')),
  async load(source, _intent) {
    if (source.type === 'dss') {
      return ok({ id: source.id });
    }
    return LoadErrors.MISSING;
  },
  accepted: {},
});

export type PullRequestData = ExtractLoadType<(typeof definition)['load']>;
