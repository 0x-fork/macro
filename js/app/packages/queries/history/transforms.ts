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
    .with({ type: 'document' }, (item) => ({
      ...base,
      type: 'document' as const,
      fileType: item.fileType,
      subType: item.subType,
      ownerId: item.owner,
    }))
    .with({ type: 'chat' }, (item) => ({
      ...base,
      type: 'chat' as const,
      isPersistent: item.isPersistent,
      ownerId: item.userId,
    }))
    .with({ type: 'project' }, (item) => ({
      ...base,
      type: 'project' as const,
      ownerId: item.userId,
    }))
    .exhaustive();
}

export function transformHistoryResponse(
  response: HistoryQueryResponse
): HistoryItem[] {
  return response.data.map(transformHistoryItem);
}
