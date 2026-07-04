import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { ok } from 'neverthrow';
import { lazy } from 'solid-js';

export const definition = defineBlock({
  name: 'channel',
  description: '',
  // Lazy chunk: keeps this block's UI out of the entry bundle; the
  // definition itself stays eager for file-type routing.
  component: lazy(() =>
    import('./component/NewChannelBlockAdapter').then((m) => ({
      default: m.NewChannelBlockAdapter,
    }))
  ),
  liveTrackingEnabled: true,
  async load(source, _intent) {
    if (source.type === 'dss') {
      return ok({ id: source.id });
    }
    return LoadErrors.MISSING;
  },
  accepted: {},
});

export type ChannelData = ExtractLoadType<(typeof definition)['load']>;
