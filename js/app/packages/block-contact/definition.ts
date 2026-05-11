import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { ok } from '@core/util/maybeResult';
import { ContactBlock } from './component/Block';

export const definition = defineBlock({
  name: 'contact',
  description: 'View contact and company profiles',
  component: ContactBlock,
  liveTrackingEnabled: false,
  async load(source, _intent) {
    if (source.type === 'dss') {
      return ok({ id: source.id });
    }
    return LoadErrors.MISSING;
  },
  accepted: {},
});

export type ContactData = ExtractLoadType<(typeof definition)['load']>;
