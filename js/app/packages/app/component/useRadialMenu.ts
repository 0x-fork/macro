import { registerHotkey, useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import type { ValidHotkey } from '@core/hotkey/types';
import type { RadialMenuItem, RadialMenuMode } from '@ui';
import { type Accessor, createSignal, onCleanup, onMount } from 'solid-js';
import { useRadialMenuGroup } from './radialMenuGroup';

export interface UseRadialMenuConfig {
  /** Menu items — each item's `hotkey` is registered in the command scope. */
  items: RadialMenuItem[];
  /** Hotkey that opens the menu in hold mode (e.g. `'c'`). */
  triggerHotkey?: ValidHotkey;
  /** Command-palette description for the trigger hotkey. */
  triggerDescription?: string;
  /**
   * Existing hotkey scope to register the trigger in (e.g. from `useHotkeyDOMScope`).
   * Use this to host several menus in one scope. Takes precedence over `element`;
   * the caller owns the scope (this hook won't create or remove it).
   */
  scopeId?: string;
  /**
   * Element whose focus activates a hotkey scope created for the trigger. Used only
   * when `scopeId` is omitted. Omit both to register on the global scope.
   */
  element?: Accessor<Element | undefined>;
}

export interface RadialMenuController {
  /** Spread onto `<RadialMenu>`: */
  open: Accessor<boolean>;
  x: Accessor<number>;
  y: Accessor<number>;
  mode: Accessor<RadialMenuMode>;
  setOpen: (open: boolean) => void;
  /** Wire to `<RadialMenu activeItemRef>`. */
  activeItemRef: (item: Accessor<RadialMenuItem | undefined>) => void;
  /** Open at a viewport point — for pointer triggers like right-click. */
  openAt: (x: number, y: number, mode?: RadialMenuMode) => void;
  close: () => void;
}

/**
 * Owns a radial menu's open/anchor/mode state and wires it to the app hotkey
 * system, returning a controller to spread onto `<RadialMenu>`.
 *
 * - The trigger hotkey opens the menu in hold mode and (via `activateCommandScope`)
 *   activates a command scope holding every item's `hotkey`.
 * - The trigger's `keyUpHandler` resolves the gesture on release: commit the aimed
 *   item, or — for a tap with nothing aimed — flip to `'toggle'` so it stays sticky.
 * - Cleanup is handled by `useHotkeyDOMScope` and the trigger's disposer (which
 *   removes the command scope and its item hotkeys), so there are no per-hotkey
 *   `onCleanup`s.
 *
 * `items` is read once at setup — keep the array stable for the component's life.
 */
export function useRadialMenu(
  config: UseRadialMenuConfig
): RadialMenuController {
  // Open state is owned by a shared group so only one radial menu is open at a time;
  // `open` is derived as "am I the active menu?". Opening this menu atomically closes
  // any other.
  const group = useRadialMenuGroup();
  const id = Symbol('radial-menu');
  const open = () => group.isOpen(id);
  const setOpen = (v: boolean) => (v ? group.open(id) : group.close(id));
  onCleanup(() => group.close(id));

  const [anchor, setAnchor] = createSignal({ x: 0, y: 0 });
  const [mode, setMode] = createSignal<RadialMenuMode>('toggle');

  // The component hands us its aimed-item accessor via `activeItemRef`; we read it
  // on demand (in `keyUpHandler`) rather than mirroring it into a signal.
  let aimedItem: Accessor<RadialMenuItem | undefined> = () => undefined;

  // Track the cursor so the keyboard trigger can open at the pointer.
  let cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const onPointerMove = (e: PointerEvent) => {
    cursor = { x: e.clientX, y: e.clientY };
  };
  window.addEventListener('pointermove', onPointerMove);
  onCleanup(() => window.removeEventListener('pointermove', onPointerMove));

  const openAt = (x: number, y: number, m: RadialMenuMode = 'toggle') => {
    setAnchor({ x, y });
    setMode(m);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const select = (item: RadialMenuItem) => {
    item.onSelect();
    setOpen(false);
  };

  // Trigger scope: a caller-owned `scopeId`, else a DOM scope created for `element`,
  // else the global scope.
  let scopeId = config.scopeId ?? 'global';
  if (!config.scopeId && config.element) {
    const [attachScope, domScopeId] = useHotkeyDOMScope('radial-menu');
    scopeId = domScopeId;
    onMount(() => {
      const el = config.element?.();
      if (!el) return;
      attachScope(el);
      // Focus the element so its scope is active immediately.
      if (el instanceof HTMLElement) el.focus();
    });
  }

  if (config.triggerHotkey) {
    const trigger = registerHotkey({
      scopeId,
      hotkey: config.triggerHotkey,
      description: config.triggerDescription ?? 'Open radial menu',
      activateCommandScope: true,
      keyDownHandler: (e) => {
        // Ignore OS auto-repeat so holding the trigger doesn't toggle repeatedly.
        if (e?.repeat) return true;
        // Press toggles: open at the cursor (hold mode) when closed, close when
        // already open (e.g. a second tap of the trigger).
        if (open()) close();
        else openAt(cursor.x, cursor.y, 'hold');
        return true;
      },
      // Resolve the hold gesture on release: commit the aimed item, or — on a tap
      // with nothing aimed — flip to toggle so the menu stays open (sticky).
      // (No-op if the press just closed the menu.)
      keyUpHandler: () => {
        if (!open()) return;
        const item = aimedItem();
        if (item) select(item);
        else setMode('toggle');
      },
    });
    onCleanup(() => trigger.dispose());

    // Item shortcuts live in the trigger's command scope.
    const { commandScopeId } = trigger;
    for (const item of config.items) {
      if (!item.hotkey || item.disabled) continue;
      registerHotkey({
        scopeId: commandScopeId,
        hotkey: item.hotkey as ValidHotkey,
        description: typeof item.label === 'string' ? item.label : 'Menu item',
        keyDownHandler: () => {
          if (!open()) return false;
          select(item);
          return true;
        },
      });
    }
  }

  return {
    open,
    x: () => anchor().x,
    y: () => anchor().y,
    mode,
    setOpen,
    activeItemRef: (accessor) => {
      aimedItem = accessor;
    },
    openAt,
    close,
  };
}
