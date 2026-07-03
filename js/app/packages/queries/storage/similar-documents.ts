import {
  type SimilarDocument,
  storageServiceClient,
} from '@service-storage/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { entityKeys } from './keys';

async function fetchSimilarDocuments(
  documentId: string
): Promise<SimilarDocument[]> {
  const result = await storageServiceClient.getSimilarDocuments({ documentId });
  if (result.isErr()) {
    throw new Error('Failed to fetch similar documents');
  }
  return result.value;
}

export function useSimilarDocumentsQuery(
  documentId: Accessor<string>,
  enabled?: Accessor<boolean>
) {
  return useQuery(() => ({
    queryKey: entityKeys.similarDocuments(documentId()).queryKey,
    queryFn: () => fetchSimilarDocuments(documentId()),
    enabled: !!documentId() && (enabled?.() ?? true),
    // Each fetch embeds the document server-side before searching, so keep
    // results around longer than cheap metadata queries.
    staleTime: 5 * 60 * 1000,
  }));
}
