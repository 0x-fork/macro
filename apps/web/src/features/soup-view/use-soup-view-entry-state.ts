import { useList } from '@app/components/list';
import type { SoupItem } from '@app/features/soup-list';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';
import { useSoupView } from './context';

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
};

/** Restores and captures runtime state that requires mounted list/view handles. */
export function useSoupViewEntryState(options: UseSoupViewEntryStateOptions) {
  const panel = useSplitPanelOrThrow();
  const view = useSoupView();
  const { state: listState } = useList<SoupItem>();
  const entryState = panel.handle.currentEntryState();
  const restoredListState = entryState?.[SOUP_LIST_STATE_ENTRY_KEY] as
    | SoupListEntryState
    | undefined;

  const previewEntity = entryState?.[SOUP_PREVIEW_ENTITY_ENTRY_KEY];
  const persistedPreviewEntity =
    typeof previewEntity === 'string' ? previewEntity : undefined;
  const viewMode = entryState?.['soup.viewMode'];
  if (viewMode === 'list' || viewMode === 'board') {
    view.setViewMode(viewMode);
  }

  const captorTeardowns = [
    panel.handle.registerEntryStateCaptor('soup.viewMode', view.viewMode),
    panel.handle.registerEntryStateCaptor(
      SOUP_PREVIEW_ENTITY_ENTRY_KEY,
      () => view.previewEntity()?.id
    ),
    panel.handle.registerEntryStateCaptor(
      SOUP_PREVIEW_OPEN_ENTRY_KEY,
      view.previewOpen
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

  return { restoredListState, persistedPreviewEntity };
}
