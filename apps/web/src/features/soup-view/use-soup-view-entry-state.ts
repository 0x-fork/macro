import { useList } from '@app/components/list';
import {
  type SoupCollectionSort,
  type SoupItem,
  useSoupCollection,
} from '@app/features/soup-list';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { batch, createSignal, onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';

const SOUP_LIST_STATE_ENTRY_KEY = 'soup.listState';
const SOUP_PREVIEW_ENTITY_ENTRY_KEY = 'soup.preview';
const SOUP_PREVIEW_OPEN_ENTRY_KEY = 'soup.previewOpen';

export type SoupListEntryState = {
  focus?: string;
  virtualCache?: CacheSnapshot;
  scrollOffset?: number;
};

type UseSoupViewEntryStateOptions = {
  virtualizer: () => VirtualizerHandle | undefined;
  initialPreviewOpen?: boolean;
  defaultPreviewOpen: boolean;
  restoreCollection?: boolean;
};

/** Restores and captures all split-entry-owned Soup view state. */
export function useSoupViewEntryState(options: UseSoupViewEntryStateOptions) {
  const panel = useSplitPanelOrThrow();
  const collection = useSoupCollection();
  const { state: listState } = useList<SoupItem>();
  const selectedEntity = () => {
    const item = listState.focus.item();
    return item?.kind === 'entity' ? item.entity : undefined;
  };
  const entryState = panel.handle.currentEntryState();
  const restoredListState = entryState?.[SOUP_LIST_STATE_ENTRY_KEY] as
    | SoupListEntryState
    | undefined;

  if (options.restoreCollection ?? true) {
    batch(() => {
      const facets = entryState?.['search.facets'];
      if (facets && typeof facets === 'object') {
        collection.facets.hydrate(collection.facets.deserialize(facets));
      }

      const search = entryState?.['search.text'];
      if (typeof search === 'string') collection.setSearch(search);

      const sort = entryState?.['soup.sort'];
      if (Array.isArray(sort)) {
        collection.setSort(
          sort.filter(
            (item): item is SoupCollectionSort =>
              typeof item === 'object' &&
              item !== null &&
              'id' in item &&
              typeof item.id === 'string' &&
              'reversed' in item &&
              typeof item.reversed === 'boolean'
          )
        );
      }

      const groupBy = entryState?.['soup.groupBy'];
      if (typeof groupBy === 'string' || groupBy === null) {
        collection.setGroupBy(groupBy ?? undefined);
      }

      const collapsed = entryState?.['soup.collapsedGroups'];
      if (Array.isArray(collapsed)) {
        collection.disclosure.collapseAll(collapsed);
      }

      const activeTab = entryState?.['soup.tab'];
      if (typeof activeTab === 'string') {
        collection.setActiveTab(activeTab);
      }

      const viewMode = entryState?.['soup.viewMode'];
      if (viewMode === 'list' || viewMode === 'board') {
        collection.setViewMode(viewMode);
      }
    });
  }

  const persistedPreviewEntity = entryState?.[SOUP_PREVIEW_ENTITY_ENTRY_KEY] as
    | string
    | undefined;
  const persistedPreviewOpen = entryState?.[SOUP_PREVIEW_OPEN_ENTRY_KEY] as
    | boolean
    | undefined;
  const [previewOpen, setPreviewOpen] = createSignal(
    persistedPreviewOpen ??
      options.initialPreviewOpen ??
      (persistedPreviewEntity ? true : options.defaultPreviewOpen)
  );

  const captorTeardowns = [
    panel.handle.registerEntryStateCaptor(
      'search.facets',
      collection.facets.serialize
    ),
    panel.handle.registerEntryStateCaptor('search.text', collection.search),
    panel.handle.registerEntryStateCaptor('soup.sort', () =>
      collection.sort().map((item) => ({ ...item }))
    ),
    panel.handle.registerEntryStateCaptor(
      'soup.groupBy',
      () => collection.groupBy() ?? null
    ),
    panel.handle.registerEntryStateCaptor('soup.collapsedGroups', () => [
      ...collection.disclosure.toggledIds(),
    ]),
    panel.handle.registerEntryStateCaptor('soup.tab', collection.activeTab),
    panel.handle.registerEntryStateCaptor('soup.viewMode', collection.viewMode),
    panel.handle.registerEntryStateCaptor(
      SOUP_PREVIEW_ENTITY_ENTRY_KEY,
      () => selectedEntity()?.id
    ),
    panel.handle.registerEntryStateCaptor(
      SOUP_PREVIEW_OPEN_ENTRY_KEY,
      previewOpen
    ),
  ];

  if (panel.handle.content().type !== 'project') {
    captorTeardowns.push(
      panel.handle.registerEntryStateCaptor(
        SOUP_LIST_STATE_ENTRY_KEY,
        (): SoupListEntryState => ({
          focus: listState.focus.id(),
          virtualCache: options.virtualizer()?.cache,
          scrollOffset: options.virtualizer()?.scrollOffset,
        })
      )
    );
  }

  onCleanup(() => {
    for (const teardown of captorTeardowns) teardown();
  });

  return {
    previewOpen,
    setPreviewOpen,
    restoredListState,
    persistedPreviewEntity,
  };
}
