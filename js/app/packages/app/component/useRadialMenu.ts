import { registerHotkey } from '@core/hotkey/hotkeys';
import { activeScope, setActiveScope } from '@core/hotkey/state';
import type { ValidHotkey } from '@core/hotkey/types';
import {
  activateClosestDOMScope,
  getScopeId,
  registerScope,
  removeScope,
} from '@core/hotkey/utils';
import type { RadialMenuItem } from '@ui';
import { createEffect, onCleanup, untrack } from 'solid-js';

export interface UseRadialMenuConfig {
  /** The DOM hotkey scope the trigger lives in (from `useHotkeyDOMScope`). */
  scopeId: string;
  /** Menu items — each item's `hotkey` is registered in the command scope. */
  items: RadialMenuItem[];
  /** Reactive open state of the menu; drives command-scope activation. */
  isOpen: () => boolean;
  /** Run an item's action (the host should also close the menu here). */
  onSelect: (item: RadialMenuItem) => void;
  /** Hotkey that opens the menu (e.g. `'c'`). */
  triggerHotkey?: ValidHotkey;
  /** Called when the trigger fires; the host opens the menu. */
  onTrigger?: () => void;
  /** Command-palette description for the trigger hotkey. */
  triggerDescription?: string;
}

/**
 * Integrates a radial menu with the app hotkey system:
 * - registers an optional trigger hotkey in `scopeId` that opens the menu;
 * - creates a **command scope** and registers every item's `hotkey` inside it;
 * - activates that command scope while the menu is open (so the item hotkeys
 *   fire) and restores the surrounding DOM scope when it closes.
 *
 * Pointer aiming, click-to-commit, hold-to-release and Escape live inside
 * `<RadialMenu>`; this hook owns only the keyboard item shortcuts so they flow
 * through the same hotkey system as the rest of the app.
 *
 * `items` is read once at setup — keep the array stable for the component's life.
 */
export function useRadialMenu(config: UseRadialMenuConfig): void {
  const commandScopeId = getScopeId('radial-menu-command');
  registerScope({
    parentScopeId: config.scopeId,
    scopeId: commandScopeId,
    type: 'command',
    activationKeys: config.triggerHotkey ? [config.triggerHotkey] : [],
  });
  onCleanup(() => removeScope(commandScopeId));

  // Trigger hotkey opens the menu (lives in the surrounding DOM scope).
  if (config.triggerHotkey) {
    const trigger = registerHotkey({
      scopeId: config.scopeId,
      hotkey: config.triggerHotkey,
      description: config.triggerDescription ?? 'Open radial menu',
      keyDownHandler: () => {
        if (!config.isOpen()) config.onTrigger?.();
        return true;
      },
    });
    onCleanup(() => trigger.dispose());
  }

  // Item shortcuts live in the command scope (active only while the menu is open).
  for (const item of config.items) {
    if (!item.hotkey || item.disabled) continue;
    const reg = registerHotkey({
      scopeId: commandScopeId,
      hotkey: item.hotkey as ValidHotkey,
      description: typeof item.label === 'string' ? item.label : 'Menu item',
      keyDownHandler: () => {
        config.onSelect(item);
        return true;
      },
    });
    onCleanup(() => reg.dispose());
  }

  // Activate the command scope while open; restore the DOM scope on close.
  createEffect(() => {
    if (config.isOpen()) {
      setActiveScope(commandScopeId);
    } else {
      untrack(() => {
        if (activeScope() === commandScopeId) activateClosestDOMScope();
      });
    }
  });
}
