import { isListViewID, type ListView } from '@app/constants/list-views';
import type { PanelSizeSpec } from '@core/component/Resize/types';
import type { SplitContent } from './layoutManager';

/**
 * Split panel width policy — the single source of truth for split minimum
 * widths. Layout code must consume these helpers rather than hardcoding
 * pixel literals.
 */

/** The standard minimum width (px) for a split panel. */
export const DEFAULT_SPLIT_MIN_WIDTH = 400;

/**
 * Views designed to work as narrow panels declare a reduced minimum here,
 * keyed by list-view component id. An overridden view also opens at its
 * minimum — the point of allowing a narrower panel is to use it as a slim
 * list beside content, so that is its default footprint.
 */
const SPLIT_MIN_WIDTH_OVERRIDES: Partial<Record<ListView, number>> = {
  channels: 360,
};

/** Minimum width (px) for a list-view component split. */
export function listViewSplitMinWidth(view: ListView): number {
  return SPLIT_MIN_WIDTH_OVERRIDES[view] ?? DEFAULT_SPLIT_MIN_WIDTH;
}

function minWidthOverride(content: SplitContent): number | undefined {
  if (content.type !== 'component' || !isListViewID(content.id)) return;
  return SPLIT_MIN_WIDTH_OVERRIDES[content.id];
}

/** Minimum width (px) for a split panel showing `content`. */
export function splitMinWidth(content: SplitContent): number {
  return minWidthOverride(content) ?? DEFAULT_SPLIT_MIN_WIDTH;
}

/**
 * Width a split panel showing `content` opens at, or `undefined` for the
 * standard equal-share distribution. Only views with a min-width override
 * have an opening width: they open at their minimum.
 */
export function splitOpeningWidth(
  content: SplitContent
): PanelSizeSpec | undefined {
  const override = minWidthOverride(content);
  return override === undefined ? undefined : { kind: 'px', px: override };
}
