import { itemToSafeName } from '@core/constant/allBlocks';
import type { Item } from '@service-storage/generated/schemas/item';
import { formatDocumentName } from '@service-storage/util/filename';
import { match } from 'ts-pattern';
import type { HistoryItem, HistoryQueryResponse } from './types';

export function transformHistoryItem(item: Item): HistoryItem {
  const safeName = itemToSafeName(item);
  const name =
    item.type === 'document'
      ? formatDocumentName(safeName, item.fileType, {
          fullyQualifiedBlockName: true,
        })
      : safeName;
  const base = {
    id: item.id,
    name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
    rawName: item.name,
  };

  return match(item)
    .with({ type: 'document' }, (i) => ({
      ...base,
      type: 'document' as const,
      fileType: i.fileType,
      subType: i.subType,
      ownerId: i.owner,
    }))
    .with({ type: 'chat' }, (i) => ({
      ...base,
      type: 'chat' as const,
      isPersistent: i.isPersistent,
      ownerId: i.userId,
    }))
    .with({ type: 'project' }, (i) => ({
      ...base,
      type: 'project' as const,
      ownerId: i.userId,
    }))
    .exhaustive();
}

export function transformHistoryResponse(
  response: HistoryQueryResponse
): HistoryItem[] {
  return response.data.map(transformHistoryItem);
}
