import { type ItemType, storageServiceClient } from '@service-storage/client';
import type { ApiAttachmentEntityReference } from '@service-storage/generated/schemas/apiAttachmentEntityReference';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { attachmentReferencesKeys } from './keys';

const ATTACHMENT_REFERENCES_STALE_TIME = 60 * 1000;

type MaybeAccessor<T> = T | Accessor<T>;

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as Accessor<T>)() : value;
}

async function fetchAttachmentReferences(
  entityType: ItemType,
  entityId: string
): Promise<ApiAttachmentEntityReference[]> {
  const response = await storageServiceClient.attachmentReferences({
    entity_type: entityType,
    entity_id: entityId,
  });

  if (response.isErr()) {
    console.error(response);
    return [];
  }

  return response.value.references;
}

export function useAttachmentReferencesQuery(
  entityId: MaybeAccessor<string | null | undefined>,
  entityType: MaybeAccessor<ItemType> = 'document'
) {
  return useQuery(() => {
    const id = read(entityId);
    const type = read(entityType);

    return {
      queryKey: id
        ? attachmentReferencesKeys.list(type, id).queryKey
        : attachmentReferencesKeys.list._def,
      queryFn: () => {
        if (!id) {
          throw new Error(
            'Entity ID is required to fetch attachment references'
          );
        }
        return fetchAttachmentReferences(type, id);
      },
      staleTime: ATTACHMENT_REFERENCES_STALE_TIME,
      enabled: !!id,
    };
  });
}
