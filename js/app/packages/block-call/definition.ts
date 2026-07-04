import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { ENABLE_CALLS } from '@core/constant/featureFlags';
import { ok } from 'neverthrow';
import { lazy } from 'solid-js';

export const definition = defineBlock({
  name: 'call',
  description: '',
  defaultFilename: 'Call',
  // Lazy chunk: keeps this block's UI out of the entry bundle; the
  // definition itself stays eager for file-type routing.
  component: lazy(() =>
    import('./component/CallBlockAdapter').then((m) => ({
      default: m.CallBlockAdapter,
    }))
  ),
  async load(source, _intent) {
    if (!ENABLE_CALLS()) return LoadErrors.MISSING;
    if (source.type === 'dss') {
      return ok({ id: source.id });
    }
    return LoadErrors.MISSING;
  },
  accepted: {},
});

export type CallData = ExtractLoadType<(typeof definition)['load']>;
