import { useList } from '@app/components/list';
import type { SoupRow } from '@app/features/soup/collection';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';

const SOUP_LIST_STATE_ENTRY_KEY = 'soup.listState';

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
  const { state: listState } = useList<SoupRow>();
  const entryState = panel.handle.currentEntryState();
  const restoredListState = entryState?.[SOUP_LIST_STATE_ENTRY_KEY] as
    | SoupListEntryState
    | undefined;

  const disposeListCaptor =
    panel.handle.content().type !== 'project'
      ? panel.handle.registerEntryStateCaptor(
          SOUP_LIST_STATE_ENTRY_KEY,
          (): SoupListEntryState => ({
            focus: listState.focus.id(),
            virtualCache: options.virtualizer()?.cache,
            scrollOffset: options.virtualizer()?.scrollOffset,
          })
        )
      : undefined;

  onCleanup(() => disposeListCaptor?.());

  return { restoredListState };
}
