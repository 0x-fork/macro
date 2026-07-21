import { useList } from '@app/components/list';
import { getSoupRowEntities, type SoupRow } from '@app/features/soup-list';
import type { EntityData } from '@entity';
import { type Accessor, createEffect, createSignal } from 'solid-js';
import type { SoupViewContextValue } from '../../../context';

/** Restores a persisted board preview, paging until it is found or exhausted. */
export function useCompanyBoardPreviewRestoration(options: {
  enabled: Accessor<boolean>;
  persistedEntityId?: string;
  previewEntity: Accessor<EntityData | undefined>;
  setPreviewEntity: SoupViewContextValue['setPreviewEntity'];
}) {
  const { dataSource } = useList<SoupRow>();
  let settled = false;
  let loading = false;
  const [attempt, setAttempt] = createSignal(0);

  createEffect(() => {
    if (!options.enabled()) return;
    attempt();
    const entities = getSoupRowEntities(dataSource.items());
    const current = options.previewEntity();
    if (!settled && current && current.id !== options.persistedEntityId) {
      settled = true;
    }

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
        if (options.persistedEntityId && !current) {
          options.setPreviewEntity(undefined);
        }
      } else if (!dataSource.isLoadingMore() && !loading) {
        loading = true;
        void dataSource.loadMore().finally(() => {
          loading = false;
          setAttempt((value) => value + 1);
        });
      }
    }

    if (
      current &&
      !dataSource.isLoading() &&
      !entities.some((entity) => entity.id === current.id)
    ) {
      options.setPreviewEntity(undefined);
    }
  });
}
