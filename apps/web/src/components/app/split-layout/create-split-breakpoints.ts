import { type Accessor, createMemo } from 'solid-js';
import { useSplitPanelOrThrow } from './layoutUtils';

export type SplitBreakpoint =
  | number
  | {
      minWidth?: number;
      /** Exclusive upper bound. */
      maxWidth?: number;
    };

export type SplitBreakpointMatches<
  TBreakpoints extends Record<string, SplitBreakpoint>,
> = {
  [TKey in keyof TBreakpoints]: Accessor<boolean>;
};

/** Creates reactive minimum-, maximum-, or range-width matches for a split. */
export function createSplitBreakpoints<
  const TBreakpoints extends Record<string, SplitBreakpoint>,
>(breakpoints: TBreakpoints): SplitBreakpointMatches<TBreakpoints> {
  const panel = useSplitPanelOrThrow();
  const matches = {} as SplitBreakpointMatches<TBreakpoints>;

  for (const key of Object.keys(breakpoints) as (keyof TBreakpoints)[]) {
    const breakpoint = breakpoints[key];
    const minWidth =
      typeof breakpoint === 'number' ? breakpoint : breakpoint.minWidth;
    const maxWidth =
      typeof breakpoint === 'number' ? undefined : breakpoint.maxWidth;

    if (minWidth === undefined && maxWidth === undefined) {
      throw new Error(`Split breakpoint "${String(key)}" has no width bound`);
    }
    if (
      minWidth !== undefined &&
      maxWidth !== undefined &&
      maxWidth <= minWidth
    ) {
      throw new Error(
        `Split breakpoint "${String(key)}" must have maxWidth greater than minWidth`
      );
    }

    matches[key] = createMemo(() => {
      const width = panel.panelSize.width;
      if (width === undefined || width === null) return false;
      return (
        (minWidth === undefined || width >= minWidth) &&
        (maxWidth === undefined || width < maxWidth)
      );
    });
  }

  return matches;
}
