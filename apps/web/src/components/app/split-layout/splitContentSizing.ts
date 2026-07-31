import { isListViewID } from '@app/constants/list-views';
import type { SplitContent } from './layoutManager';

/** Default hard minimum width for split content without an override. */
export const DEFAULT_SPLIT_MIN_WIDTH = 400;

type SplitContentSizingContext = {
  isPreviewController: boolean;
};

type SplitContentSizingConfig = {
  matches: (
    content: SplitContent,
    context: SplitContentSizingContext
  ) => boolean;
  minWidthPx: number;
};

/**
 * Declarative hard-size overrides for categories of split content. Earlier
 * rules take precedence, allowing exact-content exceptions before broad rules.
 */
const SPLIT_CONTENT_SIZING_CONFIG: readonly SplitContentSizingConfig[] = [
  {
    matches: (content, context) =>
      context.isPreviewController &&
      content.type === 'component' &&
      isListViewID(content.id),
    // The list panel's nav rows and two-line pills collapse gracefully well
    // below main's old 300px floor.
    minWidthPx: 240,
  },
];

/** Resolve the hard minimum width for a split from its mounted content. */
export function splitMinWidthForContent(
  content: SplitContent,
  context: SplitContentSizingContext
): number {
  const config = SPLIT_CONTENT_SIZING_CONFIG.find((candidate) =>
    candidate.matches(content, context)
  );
  return config?.minWidthPx ?? DEFAULT_SPLIT_MIN_WIDTH;
}
