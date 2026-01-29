import {
  createFilterState,
  type FilterConfig,
} from '@app/component/next-unified-list/filters';
import { SOUP_FILTERS } from '@app/component/next-unified-list/filters/filters';
import { createSelectionState } from '@app/component/next-unified-list/selection-state';
import type { EntityData, WithSearch } from '@macro-entity';
import { createMemo, createSignal } from 'solid-js';

type SoupEntity = EntityData | WithSearch<EntityData>;

export type GroupConfig<T> = {
  id: string;
  getValue: (item: T) => unknown;
};

export type SortConfig<T> = {
  id: string;
  fn: (a: T, b: T) => number;
  desc?: boolean;
};

export type NavigationResult<T> = { item: T; index: number } | undefined;

export type EntityTransformer = (entity: SoupEntity[]) => SoupEntity[];

interface SoupContextOptions {
  initialData?: SoupEntity[];
  wrapNavigation?: boolean;
  transformers?: EntityTransformer[];
}

export const createSoupState = (
  { wrapNavigation, initialData }: SoupContextOptions = {
    wrapNavigation: false,
  }
) => {
  const selection = createSelectionState<SoupEntity>({
    getItemId: (i) => i.id,
  });

  const filters = createFilterState<SoupEntity, FilterConfig<SoupEntity>>({
    filters: SOUP_FILTERS,
  });

  const [sort, setSort] = createSignal<SortConfig<SoupEntity>[]>([
    {
      id: 'updated_at',
      fn(a, b) {
        const aUpdatedAt = a.updatedAt ?? 0;
        const bUpdatedAt = b.updatedAt ?? 0;

        return bUpdatedAt - aUpdatedAt;
      },
    },
  ]);

  const [groups, setGroups] = createSignal<GroupConfig<SoupEntity>[]>([]);

  const [data, setDataInternal] = createSignal<SoupEntity[]>(initialData ?? []);

  const setData = (newData: SoupEntity[]) => {
    setDataInternal(newData);
  };

  const [previewEntity, setPreviewEntity] = createSignal<string | undefined>();

  const [focusedId, setFocusedId] = createSignal<string | undefined>();

  const indexOf = (id: string): number => data().findIndex((r) => r.id === id);

  const focusedIndex = createMemo(() => {
    const id = focusedId();
    if (!id) return -1;
    return indexOf(id);
  });

  const focused = createMemo(() => {
    const index = focusedIndex();
    if (index === -1) return undefined;
    return data()[index];
  });

  const getItem = (id: string): SoupEntity | undefined =>
    data().find((e) => e.id === id);

  const getItemAt = (index: number): SoupEntity | undefined => data()[index];

  // Navigation implementation
  const setFocus = (index: number): NavigationResult<SoupEntity> => {
    const visibleRows = data();
    if (visibleRows.length === 0) return undefined;

    let targetIndex = index;
    if (targetIndex < 0) {
      targetIndex = wrapNavigation ? visibleRows.length - 1 : 0;
    } else if (targetIndex >= visibleRows.length) {
      targetIndex = wrapNavigation ? 0 : visibleRows.length - 1;
    }

    const row = visibleRows[targetIndex];
    if (!row) return undefined;

    setFocusedId(row.id);
    return { item: row, index: targetIndex };
  };

  const navigateBy = (offset: number): NavigationResult<SoupEntity> => {
    const current = focusedIndex();
    if (current === -1) {
      return setFocus(offset > 0 ? 0 : data().length - 1);
    }
    return setFocus(current + offset);
  };

  const clearFocus = () => {
    setFocusedId(undefined);
  };

  return {
    data,
    setData,
    filters,
    selection,
    sort,
    setSort,
    groups,
    setGroups,

    focus: {
      item: focused,
      id: focusedId,
      index: focusedIndex,
      clear: clearFocus,
      set: (id: string | undefined) => setFocusedId(id),
    },

    navigate: {
      down: () => navigateBy(1),
      up: () => navigateBy(-1),
      by: navigateBy,
      toIndex: setFocus,
      toId: (id: string) => {
        const index = indexOf(id);
        if (index === -1) return undefined;
        return setFocus(index);
      },
      toFirst: () => setFocus(0),
      toLast: () => setFocus(data().length - 1),
      peekOffset: (offset: number) => {
        const current = focusedIndex();
        const next = navigateBy(offset);
        setFocus(current);
        return next;
      },
    },

    items: {
      data,
      count: () => data().length,
      get: getItem,
      at: getItemAt,
      indexOf,
    },

    previewEntity,
    setPreviewEntity,
  };
};

export type SoupState = ReturnType<typeof createSoupState>;
