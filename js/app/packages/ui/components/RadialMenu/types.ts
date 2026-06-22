import type { Accessor, Component } from 'solid-js';
import type { Direction, Ring } from './geometry';

/**
 * How the menu commits a selection (controlled by the host via `mode`):
 * - `'toggle'`: stays open; commit on click (or a slot hotkey), cancel on Escape /
 *   click in the dead zone / click in an empty direction.
 * - `'hold'`: commit happens on the trigger's release, which the host drives (the
 *   menu reports the aimed item via `onActiveItemChange`; the host commits it or,
 *   for a tap with nothing aimed, flips `mode` to `'toggle'` to stay sticky). The
 *   menu itself never listens for the release. Clicks do not commit in hold mode.
 *
 * See the `useRadialMenu` hook, which wires the hold/tap resolution to a hotkey
 * `keyUpHandler`.
 */
export type RadialMenuMode = 'hold' | 'toggle';

export interface RadialMenuItem {
  /**
   * Contiguous slots this item occupies. A single direction (`['N']`) or an arc
   * built with `span('N', 'W')`. Slots may be listed in any rotational order.
   */
  slots: Direction[];
  /** Which ring the item lives on. Defaults to `'inner'`. */
  ring?: Ring;
  /** Text label rendered at the item's centroid. */
  label?: string;
  /**
   * Icon component rendered above the label. Receives a `class` for sizing and
   * `triggerAnimation` (true while this item is the aimed slot) — animated icons
   * use it to play their hover animation. Plain `*.svg` imports work too.
   */
  icon?: Component<{ class?: string; triggerAnimation?: boolean }>;
  /**
   * Single key for this item (e.g. `'a'`). Shown as a badge on the label. The
   * menu does NOT bind it itself — the host registers it through its own hotkey
   * system (see the `useRadialMenu` hook) so all shortcuts share one pipeline.
   */
  hotkey?: string;
  /** Render the item dimmed and non-selectable. */
  disabled?: boolean;
  /** Invoked when the item is committed. */
  onSelect: () => void;
}

export interface RadialMenuProps {
  /** Whether the menu is open. Controlled by the host. */
  open: boolean;
  /** Cursor position (viewport coordinates) to center the menu on. */
  x: number;
  y: number;
  /** Items to render. Add any item with `ring: 'outer'` to enable the second ring. */
  items: RadialMenuItem[];
  /** Interaction model. Controlled by the host. See {@link RadialMenuMode}. Defaults to `'toggle'`. */
  mode?: RadialMenuMode;
  /**
   * Receives an accessor to the currently aimed (selectable) item — `undefined`
   * when none is aimed. Called once at setup; the host reads it on demand (e.g. to
   * resolve a hold-release commit), so there's no per-change reactive plumbing.
   */
  activeItemRef?: (item: Accessor<RadialMenuItem | undefined>) => void;
  /** Notified when the menu should open/close (always called with `false` here). */
  onOpenChange?: (open: boolean) => void;
  /** Notified when the menu is dismissed without a selection. */
  onClose?: () => void;
  /** Dead-zone radius in px. Defaults to 40. */
  deadZoneRadius?: number;
  /** Radial thickness of each ring band in px. Defaults to 96. */
  ringThickness?: number;
  /** Gap between the dead zone and rings in px. Defaults to 8. */
  ringGap?: number;
  /** Minimum gap kept between the menu and the viewport edge. Defaults to 8. */
  viewportMargin?: number;
  /** Extra classes for the menu wrapper. */
  class?: string;
}
