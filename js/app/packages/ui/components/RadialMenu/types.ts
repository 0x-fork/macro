import type { Component } from 'solid-js';
import type { Direction, Ring } from './geometry';

/**
 * How the menu commits a selection:
 * - `'toggle'`: opens and stays open; commit on click (or slot hotkey), cancel on
 *   Escape / click in the dead zone / click in an empty direction.
 * - `'hold'`: opens while a trigger is held; commit the aimed slot on release.
 *   Releasing with nothing aimed (a tap) does NOT cancel — it switches the menu to
 *   `'toggle'` so it stays open and sticky. This lets one trigger serve both a
 *   quick tap (sticky menu) and a press-drag-release gesture (marking menu).
 *
 * `mode` sets the interaction model applied each time the menu opens. The menu
 * may transition it internally (a hold tap → toggle); `onModeChange` reports the
 * effective mode after such transitions.
 */
export type RadialMenuMode = 'hold' | 'toggle';

export interface RadialMenuItem {
  /** Stable identifier (used as the render key). */
  id: string;
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
  /** Interaction model, applied on open. See {@link RadialMenuMode}. Defaults to `'toggle'`. */
  mode?: RadialMenuMode;
  /** Notified when the effective mode changes (e.g. a `'hold'` tap → `'toggle'`). */
  onModeChange?: (mode: RadialMenuMode) => void;
  /** Notified when the menu should open/close (always called with `false` here). */
  onOpenChange?: (open: boolean) => void;
  /** Notified when the menu is dismissed without a selection. */
  onClose?: () => void;
  /** Dead-zone radius in px. Defaults to 32. */
  deadZoneRadius?: number;
  /** Radial thickness of each ring band in px. Defaults to 56. */
  ringThickness?: number;
  /** Gap between the dead zone and rings in px. Defaults to 6. */
  ringGap?: number;
  /** Minimum gap kept between the menu and the viewport edge. Defaults to 8. */
  viewportMargin?: number;
  /** Extra classes for the menu wrapper. */
  class?: string;
}
