import type { BlockName } from '../block';
import { optimisticUpdateViewedAt } from '@queries/history/history';
import {
  blockNameToItemType,
  storageServiceClient,
} from '@service-storage/client';

export function trackViewed(itemId: string, blockName: BlockName) {
  optimisticUpdateViewedAt(itemId);

  storageServiceClient
    .upsertItemToUserHistory({
      itemId,
      itemType: blockNameToItemType(blockName),
    })
    .catch((err) => console.error(err));
}
