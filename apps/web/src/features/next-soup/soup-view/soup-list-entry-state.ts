import { isListViewID } from '@app/constants/list-views';
import type {
  SplitContent,
  SplitHandle,
} from '@components/app/split-layout/layoutManager';
import type { CacheSnapshot } from 'virtua/unstable_core';

/** Entry-state slice key for a soup list's restorable scroll + focus. */
export const SOUP_LIST_STATE_ENTRY_KEY = 'soup.listState';

export type SoupListEntryState = {
  focus: string | undefined;
  virtualCache?: CacheSnapshot;
  scrollOffset?: number;
};

/**
 * Record that list focus moved to `entityId` while the list itself is not the
 * split's mounted content — j/k (or the header's ▲/▼) scanning through the list
 * from inside an entity that fills the split.
 *
 * The list's own entry-state captor died with its component when the entity
 * took over the split, so the list entry still remembers the row the user
 * entered on. Writing through keeps it pointed at the row they actually ended
 * up on, so Back / Escape returns to the current item rather than the one they
 * originally opened.
 *
 * `listViewId` is the list entry to update (`navigationReferredFrom()`); the
 * nearest matching entry at or before the current one wins.
 */
export function rememberSoupListFocus(args: {
  splitHandle: SplitHandle;
  listViewId: string | undefined;
  entityId: string;
}) {
  const { splitHandle, listViewId, entityId } = args;
  if (!listViewId || !isListViewID(listViewId)) return;

  // The list entry is a different history entry than the one we're on, so its
  // captured scroll offset no longer frames the new focus. Drop it and let the
  // restore scroll the focused row into view.
  const next: SoupListEntryState = { focus: entityId };

  splitHandle.patchEntryState(
    SOUP_LIST_STATE_ENTRY_KEY,
    next,
    (content: SplitContent) =>
      content.type === 'component' && content.id === listViewId
  );
}
