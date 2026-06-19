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
import type { RadialMenuItem, RadialMenuMode, RadialMenuProps } from './types';

const DEFAULT_DEAD_ZONE = 40;
const DEFAULT_RING_THICKNESS = 96;
const DEFAULT_RING_GAP = 8;
const DEFAULT_VIEWPORT_MARGIN = 8;
/** Padding around the ring so labels never touch the wrapper edge. */
const WRAPPER_PADDING = 10;

const ringOf = (item: RadialMenuItem): Ring => item.ring ?? 'inner';

export const RadialMenu = (props: RadialMenuProps): JSX.Element => {
  const [pointer, setPointer] = createSignal({ x: props.x, y: props.y });
  const [viewport, setViewport] = createSignal({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // The mode actually in effect. It starts from `props.mode` (and resets on every
  // open) but can transition at runtime — e.g. a "hold" menu becomes "toggle" when
  // the trigger is tapped and released without aiming a slot.
  const [effectiveMode, setEffectiveMode] = createSignal<RadialMenuMode>(
    props.mode ?? 'toggle'
  );
  createEffect(() => props.onModeChange?.(effectiveMode()));

  const twoRings = createMemo(() =>
    props.items.some((item) => item.ring === 'outer')
  );

  const geo = createMemo(() =>
    computeRadialGeometry({
      deadZoneRadius: props.deadZoneRadius ?? DEFAULT_DEAD_ZONE,
      ringThickness: props.ringThickness ?? DEFAULT_RING_THICKNESS,
      ringGap: props.ringGap ?? DEFAULT_RING_GAP,
      twoRings: twoRings(),
    })
  );

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

  // Horizontal anchoring of a label box, by the bearing of its slice. West slices
  // (NW/W/SW) anchor their right edge to the radius point, east slices (NE/E/SE)
  // their left edge, and the N/S slices are centered.
  type LabelAlign = 'center' | 'east' | 'west';
  const alignForBearing = (bearing: number): LabelAlign => {
    const b = normalizeAngle(bearing);
    if (b === 0 || b === 180) return 'center';
    return b < 180 ? 'east' : 'west';
  };

  /** One positioned rectangular label per item (replaces the pie wedges). */
  const labelCells = createMemo(() => {
    const c = center();
    const g = geo();
    return props.items
      .map((item) => {
        const ring = ringOf(item);
        const b = ring === 'outer' ? g.outer : g.inner;
        if (!b) return null;
        const arc = slotArc(item.slots);
        return {
          item,
          anchor: pointOnCircle(c, c, b.midR, arc.midBearing),
          align: alignForBearing(arc.midBearing),
        };
      })
      .filter((cell): cell is NonNullable<typeof cell> => cell !== null);
  });

  // x/y translate so the chosen edge sits on the radius anchor point; always
  // vertically centered.
  const transformFor = (align: LabelAlign): string => {
    const x = align === 'center' ? '-50%' : align === 'west' ? '-100%' : '0';
    return `translate(${x}, -50%)`;
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

  // Own global listeners only while open. Keyed on `open` alone (via `on`) so the
  // listeners are attached exactly once per open and removed on close — changes to
  // unrelated props/signals (x, y, mode) read inside the body do NOT re-run it and
  // thrash the listeners.
  createEffect(
    on(
      () => props.open,
      (isOpen) => {
        if (!isOpen) return;

        // Initialize for this opening (reads are untracked inside `on`).
        setPointer({ x: props.x, y: props.y });
        setViewport({ width: window.innerWidth, height: window.innerHeight });
        setEffectiveMode(props.mode ?? 'toggle');

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

        // Hold mode commits the aimed item on release. Releasing with nothing
        // aimed (a tap) keeps the menu open and switches it to toggle/sticky.
        // Toggle mode commits on click instead.
        const onRelease = () => {
          if (effectiveMode() !== 'hold') return;
          const item = activeItem();
          if (item) select(item);
          else setEffectiveMode('toggle');
        };
        const onClick = () => {
          if (effectiveMode() !== 'hold' && armed) commitAim();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('resize', onResize);
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onRelease);
        window.addEventListener('pointerup', onRelease);
        window.addEventListener('click', onClick);

        onCleanup(() => {
          cancelAnimationFrame(raf);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('resize', onResize);
          window.removeEventListener('keydown', onKeyDown);
          window.removeEventListener('keyup', onRelease);
          window.removeEventListener('pointerup', onRelease);
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
              const isActive = () => activeItem()?.id === cell.item.id;
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
