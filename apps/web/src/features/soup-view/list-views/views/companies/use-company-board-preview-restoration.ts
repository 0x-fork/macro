import { useList } from '@app/components/list';
import { type SoupItem, useSoupCollection } from '@app/features/soup-list';
import type { EntityData } from '@entity';
import {
  type Accessor,
  createEffect,
  createSignal,
  type Setter,
} from 'solid-js';

/** Restores a persisted board preview, paging until it is found or exhausted. */
export function useCompanyBoardPreviewRestoration(options: {
  enabled: Accessor<boolean>;
  persistedEntityId?: string;
  previewEntity: Accessor<EntityData | undefined>;
  setPreviewEntity: Setter<EntityData | undefined>;
}) {
  const collection = useSoupCollection();
  const { dataSource } = useList<SoupItem>();
  let settled = false;
  let loading = false;
  const [attempt, setAttempt] = createSignal(0);

  createEffect(() => {
    if (!options.enabled()) return;
    attempt();
    const entities = collection.status.flatEntities();

    if (!settled && !dataSource.isLoading()) {
      const restored = options.persistedEntityId
        ? entities.find((entity) => entity.id === options.persistedEntityId)
        : undefined;
      if (restored) {
        options.setPreviewEntity(restored);
        settled = true;
      } else if (
        !options.persistedEntityId ||
        dataSource.error() ||
        !dataSource.hasMore()
      ) {
        settled = true;
      } else if (!dataSource.isLoadingMore() && !loading) {
        loading = true;
        void dataSource.loadMore().finally(() => {
          loading = false;
          setAttempt((value) => value + 1);
        });
      }
    }

    const current = options.previewEntity();
    if (
      current &&
      !dataSource.isLoading() &&
      !entities.some((entity) => entity.id === current.id)
    ) {
      options.setPreviewEntity(undefined);
    }
  });
}
