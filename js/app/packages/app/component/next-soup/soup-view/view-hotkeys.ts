import { useKeepAliveVisible } from '@app/component/split-layout/components/keep-alive-visibility';
import { registerHotkey } from '@core/hotkey/hotkeys';

type RegisterHotkey = typeof registerHotkey;

/**
 * registerHotkey for commands registered from within a list view tree onto
 * a shared (split) scope. List view trees are keep-alive parked rather
 * than disposed, so their registrations outlive their visibility; plain
 * `override` registration would leave whichever view registered LAST
 * owning the key, silently acting on a hidden view's state.
 *
 * `add` lets every view's registrations coexist on the scope, and the
 * visibility condition routes each key to the view actually on screen.
 * Outside keep-alive (preview panel, popovers) visibility defaults to
 * true and this behaves like plain registration.
 */
export function useViewHotkeyRegistrar(): RegisterHotkey {
  const visible = useKeepAliveVisible();
  return ((command: Parameters<RegisterHotkey>[0]) =>
    registerHotkey({
      ...command,
      registrationType: 'add',
      condition: () => visible() && (command.condition?.() ?? true),
    })) as RegisterHotkey;
}
