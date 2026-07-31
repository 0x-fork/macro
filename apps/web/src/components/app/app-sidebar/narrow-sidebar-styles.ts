/**
 * Shared visuals for the narrow sidebar's big buttons: a wide icon tile with a
 * small label underneath. Kept in their own module so components outside
 * `app-sidebar` (the create menu) can render a matching rail button without
 * importing the rail itself.
 */

/** The button wrapper — stacks the tile over the label and fills the rail. */
export const RAIL_BUTTON_CLASS =
  'group/rail flex h-auto w-full flex-col items-center justify-center gap-1 rounded-lg p-0.5 text-ink-extra-muted not-disabled:hover:bg-transparent not-disabled:hover:text-ink';

/** The rounded square behind the icon; the hover/active surface. */
export const RAIL_TILE_CLASS =
  'flex h-9 w-11 items-center justify-center rounded-lg transition-colors [&_svg]:size-5 group-hover/rail:bg-ink/6';

/** The active tile: filled and full-contrast, matching the wide sidebar's active row. */
export const RAIL_TILE_ACTIVE_CLASS =
  'bg-ink/8 text-ink group-hover/rail:bg-ink/8';

/** The caption under the tile. Truncates rather than wrapping to two lines. */
export const RAIL_LABEL_CLASS =
  'w-full truncate text-center text-[10px] font-medium leading-none';
