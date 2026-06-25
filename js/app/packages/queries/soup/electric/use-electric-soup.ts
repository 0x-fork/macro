import type { EntityData } from '@entity';
import {
  type Accessor,
  createEffect,
  createSignal,
  on,
  onCleanup,
} from 'solid-js';
import { createSoupItemsShape, mapSoupItemRowToEntity } from './client';

export type ElectricSoupItems = {
  /** Live, sort_ts-desc soup entities for the current user. */
  entities: Accessor<EntityData[]>;
  /** True until the first shape snapshot arrives. */
  isLoading: Accessor<boolean>;
  /** Populated if the shape stream errors. */
  error: Accessor<Error | undefined>;
};

/**
 * Live soup feed backed by ElectricSQL.
 *
 * Subscribes to the `soup_items` shape for `userId` and exposes reactive
 * `EntityData[]`, re-sorted newest-first to match the soup feed. The
 * subscription is torn down (and the HTTP long-poll aborted) on cleanup and
 * re-created when `userId` changes.
 *
 * Drop-in for the `.data` of `useSoupItemsQuery(...)` when
 * `isSoupElectricEnabled()` is true. Filtering/grouping/pagination are not yet
 * mirrored — v1 syncs the full per-user feed and sorts client-side.
 */
export function useElectricSoupItems(
  userId: Accessor<string | undefined>
): ElectricSoupItems {
  const [entities, setEntities] = createSignal<EntityData[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<Error | undefined>(undefined);

  createEffect(
    on(userId, (id) => {
      setEntities([]);
      setError(undefined);

      if (!id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const controller = new AbortController();
      const shape = createSoupItemsShape(id, controller.signal);

      const unsubscribe = shape.subscribe(({ rows }) => {
        const mapped = rows
          .map(mapSoupItemRowToEntity)
          .sort((a, b) => entityTs(b) - entityTs(a));
        setEntities(mapped);
        setIsLoading(false);
      });

      // Surface a failed initial sync (Shape.subscribe has no error channel).
      shape.rows.catch((err: unknown) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      });

      onCleanup(() => {
        unsubscribe();
        controller.abort();
      });
    })
  );

  return { entities, isLoading, error };
}

function entityTs(e: EntityData): number {
  const v = e.sortTs ?? e.updatedAt ?? e.createdAt;
  return v ? Date.parse(String(v)) : 0;
}
