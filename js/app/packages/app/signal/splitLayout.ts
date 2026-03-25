import { createSignal } from 'solid-js';
import type { SplitManager } from '../component/split-layout/layoutManager';
import type { SplitContent } from '../component/split-layout/layoutManager';

/**
 *  Primary global split manager for the app.
 */
export const [globalSplitManager, setGlobalSplitManager] =
  createSignal<SplitManager>();

const [globalPreviewEntities, setGlobalPreviewEntities] = createSignal<
  Map<string, SplitContent>
>(new Map());
export { globalPreviewEntities };

export function registerPreviewEntity(
  splitId: string,
  content: SplitContent | undefined
) {
  setGlobalPreviewEntities((prev) => {
    const next = new Map(prev);
    if (content) {
      next.set(splitId, content);
    } else {
      next.delete(splitId);
    }
    return next;
  });
}
