import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { Dynamic, Portal } from 'solid-js/web';
import { cn } from '../../utils/classname';
import {
  aimFromPointer,
  clampMenuPosition,
  computeRadialGeometry,
  directionToSlot,
  normalizeAngle,
  pointOnCircle,
  type Ring,
  slotArc,
} from './geometry';
import type { RadialMenuItem, RadialMenuProps } from './types';

const DEFAULT_DEAD_ZONE = 40;
const DEFAULT_RADIUS = 120;
/** Two-ring menus get a larger default radius to fit both label rings. */
const DEFAULT_TWO_RING_RADIUS = 180;
/** Default total padding (px) between the inner and outer label rings. */
const DEFAULT_RING_GAP = 24;
const DEFAULT_VIEWPORT_MARGIN = 8;
/** Padding around the ring so labels never touch the wrapper edge. */
const WRAPPER_PADDING = 10;

const ringOf = (item: RadialMenuItem): Ring => item.ring ?? 'outer';

export const RadialMenu = (props: RadialMenuProps): JSX.Element => {
  const [pointer, setPointer] = createSignal({ x: props.x, y: props.y });
  const [viewport, setViewport] = createSignal({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const hasInner = createMemo(() =>
    props.items.some((item) => ringOf(item) === 'inner')
  );
  const hasOuter = createMemo(() =>
    props.items.some((item) => ringOf(item) === 'outer')
  );

  const geo = createMemo(() => {
    const twoRings = hasInner() && hasOuter();
    return computeRadialGeometry({
      deadZoneRadius: props.deadZoneRadius ?? DEFAULT_DEAD_ZONE,
      radius:
        props.radius ?? (twoRings ? DEFAULT_TWO_RING_RADIUS : DEFAULT_RADIUS),
      ringGap: props.ringGap ?? DEFAULT_RING_GAP,
      hasInner: hasInner(),
      hasOuter: hasOuter(),
    });
  });

  const size = createMemo(() => 2 * geo().outerRadius + 2 * WRAPPER_PADDING);
  const center = createMemo(() => size() / 2);

  const position = createMemo(() =>
    clampMenuPosition(
      props.x,
      props.y,
      size(),
      viewport(),
      props.viewportMargin ?? DEFAULT_VIEWPORT_MARGIN
    )
  );
  const menuCenter = createMemo(() => ({
    x: position().left + size() / 2,
    y: position().top + size() / 2,
  }));

  const aim = createMemo(() => {
    const c = menuCenter();
    const p = pointer();
    return aimFromPointer(p.x - c.x, p.y - c.y, {
      deadZone: geo().deadZoneRadius,
      split: geo().split,
    });
  });

  const occupantAt = (ring: Ring, slot: number): RadialMenuItem | undefined =>
    props.items.find(
      (item) =>
        ringOf(item) === ring &&
        item.slots.some((dir) => directionToSlot(dir) === slot)
    );

  /** The currently aimed item that can actually be selected. */
  const activeItem = createMemo(() => {
    const a = aim();
    if (!a.ring) return undefined;
    const item = occupantAt(a.ring, a.slotIndex);
    return item && !item.disabled ? item : undefined;
  });

  // Hand the aimed-item accessor to the host (once). The host pulls the current
  // value on demand — e.g. `useRadialMenu`'s `keyUpHandler` reads it to resolve a
  // hold-release — so no per-change effect/callback round-trip is needed.
  props.activeItemRef?.(activeItem);

  // Which edge of a label box sits on the radius anchor, so the box extends to the
  // correct side of the boundary. All labels anchor on the same `radius` circle:
  // outer-ring labels extend outward, inner-ring labels inward.
  // - Horizontal: pure N/S → centered; otherwise the east/west edge flips by ring
  //   (outer extends outward, inner inward).
  // - Vertical: only pure N/S flip (so inner/outer don't overlap at top/bottom);
  //   everything else stays vertically centered.
  type LabelAlign = {
    h: 'left' | 'center' | 'right';
    v: 'top' | 'center' | 'bottom';
  };
  const alignFor = (bearing: number, ring: Ring): LabelAlign => {
    const b = normalizeAngle(bearing);

    let h: LabelAlign['h'] = 'center';
    if (b !== 0 && b !== 180) {
      const east = b < 180; // NE / E / SE
      // Outer: east → left edge at anchor (extends right/out), west → right edge.
      // Inner: reversed (extends toward center).
      h =
        ring === 'outer' ? (east ? 'left' : 'right') : east ? 'right' : 'left';
    }

    let v: LabelAlign['v'] = 'center';
    if (b === 0) {
      // North: outer extends up (bottom edge at anchor), inner extends down.
      v = ring === 'outer' ? 'bottom' : 'top';
    } else if (b === 180) {
      // South: outer extends down (top edge at anchor), inner extends up.
      v = ring === 'outer' ? 'top' : 'bottom';
    }

    return { h, v };
  };

  /** One positioned rectangular label per item (replaces the pie wedges). */
  const labelCells = createMemo(() => {
    const c = center();
    const g = geo();
    return props.items.map((item) => {
      const ring = ringOf(item);
      const r = ring === 'outer' ? g.outerLabelRadius : g.innerLabelRadius;
      const arc = slotArc(item.slots);
      return {
        item,
        anchor: pointOnCircle(c, c, r, arc.midBearing),
        align: alignFor(arc.midBearing, ring),
      };
    });
  });

  // Translate the box so its chosen edge sits on the anchor point.
  const transformFor = ({ h, v }: LabelAlign): string => {
    const tx = h === 'center' ? '-50%' : h === 'right' ? '-100%' : '0';
    const ty = v === 'center' ? '-50%' : v === 'bottom' ? '-100%' : '0';
    return `translate(${tx}, ${ty})`;
  };

  const close = () => {
    props.onClose?.();
    props.onOpenChange?.(false);
  };

  const select = (item: RadialMenuItem) => {
    item.onSelect();
    props.onOpenChange?.(false);
  };

  /** Commit whatever is currently aimed, or cancel if nothing actionable. */
  const commitAim = () => {
    const item = activeItem();
    if (item) select(item);
    else close();
  };

  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (!isOpen) return;

        // Initialize for this opening (reads are untracked inside `on`).
        setPointer({ x: props.x, y: props.y });
        setViewport({ width: window.innerWidth, height: window.innerHeight });

        // Ignore the click/keypress that opened the menu (may still be in flight).
        let armed = false;
        const raf = requestAnimationFrame(() => {
          armed = true;
        });

        const onMove = (e: PointerEvent) =>
          setPointer({ x: e.clientX, y: e.clientY });
        const onResize = () =>
          setViewport({ width: window.innerWidth, height: window.innerHeight });

        // Only Escape is handled here. Per-item `hotkey`s are intentionally NOT
        // bound internally — the host wires them through its own keyboard system
        // (e.g. the `useRadialMenu` hook + a command scope).
        const onKeyDown = (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            close();
          }
        };

        // Toggle/sticky mode commits on click. Hold mode commits on trigger
        // release, which the host drives (e.g. `useRadialMenu`'s `keyUpHandler`),
        // so there is no internal keyup/pointerup release listener here.
        const onClick = () => {
          if (props.mode !== 'hold' && armed) commitAim();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('click', onClick);

        onCleanup(() => {
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('click', onClick);
        });
      }
    )
  );

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class={cn(
            'fixed z-[1000] select-none pointer-events-none',
            props.class
          )}
          style={{
            left: `${position().left}px`,
            top: `${position().top}px`,
            width: `${size()}px`,
            height: `${size()}px`,
          }}
        >
          {/* Center marker / cancel affordance (highlights when aiming the dead zone). */}
          <div
            class={cn(
              'absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full',
              aim().ring === null ? 'bg-ink-muted' : 'bg-edge'
            )}
            style={{ left: `${center()}px`, top: `${center()}px` }}
          />

          <For each={labelCells()}>
            {(cell) => {
              // Reference identity — `activeItem()` and `cell.item` are the same
              // object from `props.items`, so no per-item id is needed.
              const isActive = () => activeItem() === cell.item;
              return (
                <div
                  class={cn(
                    // Always a solid surface box (stays legible on any canvas color);
                    // the aimed item is flagged with an accent border/ring/text.
                    'absolute flex items-center gap-1 rounded-md border bg-surface px-2 py-1 shadow-sm whitespace-nowrap',
                    cell.item.disabled
                      ? 'border-edge-muted text-ink-disabled'
                      : isActive()
                        ? 'border-accent text-accent ring-1 ring-accent'
                        : 'border-edge text-ink'
                  )}
                  style={{
                    left: `${cell.anchor.x}px`,
                    top: `${cell.anchor.y}px`,
                    transform: transformFor(cell.align),
                  }}
                >
                  <Show when={cell.item.icon}>
                    {(icon) => (
                      <Dynamic
                        component={icon()}
                        class="size-4 shrink-0"
                        triggerAnimation={isActive()}
                      />
                    )}
                  </Show>
                  <Show when={cell.item.label}>
                    <span class="text-sm font-medium leading-none">
                      {cell.item.label}
                    </span>
                  </Show>
                  <Show when={cell.item.hotkey}>
                    <span class="rounded border border-edge-muted px-1 py-0.5 text-sm leading-none text-ink-muted">
                      {cell.item.hotkey}
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Portal>
    </Show>
  );
};
