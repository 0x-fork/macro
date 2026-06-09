import { throwOnErr } from '@core/util/result';
import { storageServiceClient } from '@service-storage/client';
import { useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { pullRequestKeys } from './keys';

/**
 * Fetch a GitHub pull request foreign entity by its internal id. The PR block
 * is opened with the foreign entity's id (the same id Soup uses), so this reads
 * the stored, server-synced metadata back out for display.
 */
export function usePullRequestEntityQuery(id: Accessor<string>) {
  return useQuery(() => ({
    queryKey: pullRequestKeys.entity(id()).queryKey,
    queryFn: async () =>
      await throwOnErr(() =>
        storageServiceClient.getForeignEntity({ id: id() })
      ),
    enabled: !!id(),
  }));
}
