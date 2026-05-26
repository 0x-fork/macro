import { useBlockId } from '@core/block';
import { ENABLE_LIVE_INDICATORS } from '@core/constant/featureFlags';
import { ws } from '@service-connection/websocket';
import { handleWebsocketPayload } from '@service-connection/websocketPayload';
import { createWebsocketEventEffect } from '@websocket/index';
import { createStore, unwrap } from 'solid-js/store';
import { z } from 'zod';

type IndicatorStore = Record<string, string[]>;

const [indicatorStore, setIndicatorStore] = createStore<IndicatorStore>({});

const trackingUpdate = z.object({
  entity_id: z.string(),
  user_ids: z.array(z.string()),
  entity_type: z.string(),
});

createWebsocketEventEffect(ws, 'user_tracking_change', (data) => {
  if (!ENABLE_LIVE_INDICATORS) return;
  handleWebsocketPayload(data.type, data.data, trackingUpdate, (update) => {
    setIndicatorStore(update.entity_id, update.user_ids);
  });
});
export const useUserIndicators = () => {
  if (!ENABLE_LIVE_INDICATORS) return () => [];
  const indicators = () => unwrap(indicatorStore[useBlockId()]);
  return indicators;
};
