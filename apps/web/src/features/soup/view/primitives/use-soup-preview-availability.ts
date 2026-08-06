import type { SoupRow } from '@app/features/soup/collection';
import type { SplitHandle } from '@components/app/split-layout/layoutManager';
import { type Accessor, createEffect, createMemo, untrack } from 'solid-js';

export const hasPreviewableSoupRows = (rows: readonly SoupRow[]) =>
  rows.some((row) => row.kind === 'entity');

export function useSoupPreviewAvailability(options: {
  rows: Accessor<readonly SoupRow[]>;
  isLoading: Accessor<boolean>;
  isFetching: Accessor<boolean>;
  isPlaceholderData: Accessor<boolean>;
  splitHandle: SplitHandle;
  onPreviewRestored?: () => void;
}): Accessor<boolean> {
  const hasPreviewItems = createMemo(() =>
    hasPreviewableSoupRows(options.rows())
  );
  const isSettled = () =>
    !options.isLoading() &&
    !options.isFetching() &&
    !options.isPlaceholderData();
  let suspended = false;

  createEffect(() => {
    if (!isSettled()) return;

    if (!hasPreviewItems()) {
      if (options.splitHandle.isControllerSplit()) {
        suspended = true;
        options.splitHandle.disengagePreview();
      }
      return;
    }

    if (!suspended) return;
    suspended = false;
    untrack(() => {
      if (
        options.splitHandle.isViewerSplit() ||
        options.splitHandle.isControllerSplit() ||
        !options.splitHandle.canEngagePreview()
      ) {
        return;
      }
      options.splitHandle.engagePreview();
      if (options.splitHandle.isControllerSplit()) {
        options.onPreviewRestored?.();
      }
    });
  });

  return hasPreviewItems;
}
