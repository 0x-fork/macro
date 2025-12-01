import { defineBlock, type ExtractLoadType, LoadErrors } from '@core/block';
import { ok } from '@core/util/maybeResult';
import type { GetThreadResponse } from '@service-email/client';
import EmailBlock from './component/Block';
import { fetchAndCacheThread } from './collections/threadCollection';

export const definition = defineBlock({
  name: 'email',
  description: 'View and manage email threads',
  component: EmailBlock,
  liveTrackingEnabled: true,
  syncServiceEnabled: false,

  async load(source) {
    if (source.type === 'dss') {
      // Fetch with caching - returns cached data if fresh, otherwise fetches
      const data = await fetchAndCacheThread(source.id);

      if (!data?.thread) {
        // TODO: We lose the HTTP status code here, so we can't differentiate
        // between 404, 401, etc. For now, return MISSING as the most common case.
        return LoadErrors.MISSING;
      }

      return ok(data);
    }
    return LoadErrors.INVALID;
  },
  accepted: {},
});

export type EmailData = ExtractLoadType<(typeof definition)['load']>;
