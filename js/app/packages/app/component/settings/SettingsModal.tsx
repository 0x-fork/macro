import {
  type SettingsModalTab,
  settingsModalOpen,
  setSettingsModalOpen,
  settingsModalTab,
  setSettingsModalTab,
  themePickerFloating,
  setThemePickerFloating,
} from '@core/constant/SettingsState';
import { Button, cn, Dialog, Layer, Surface } from '@ui';
import XIcon from '@phosphor/x.svg';
import MacroLogo from '@icon/macro-logo.svg';
import UserCircleIcon from '@phosphor/user-circle.svg';
import PaintBrushIcon from '@phosphor/paint-brush.svg';
import KeyboardIcon from '@phosphor/keyboard.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import RobotIcon from '@phosphor/robot.svg';
import BellIcon from '@phosphor/bell.svg';
import SignOutIcon from '@phosphor/sign-out.svg';
import GithubLogoIcon from '@phosphor/github-logo.svg';
import ArrowSquareOutIcon from '@phosphor/arrow-square-out.svg';
import DeviceMobileIcon from '@phosphor/device-mobile-speaker.svg';
import TagIcon from '@phosphor/tag.svg';
import { type Component, For, Show, Suspense, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useLogout } from '@core/auth/logout';
import { Account } from './Account';
import { Agent } from './Agent';
import { Appearance } from './Appearance';
import { Notifications } from './Notifications';
import { Shortcuts } from './Shortcuts';
import { Team } from './Team';

type TabEntry = {
  id: SettingsModalTab;
  label: string;
  icon: Component<{ class?: string }>;
  render: () => JSX.Element;
};

const TABS: TabEntry[] = [
  {
    id: 'account',
    label: 'Account',
    icon: UserCircleIcon,
    render: () => <Account />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: PaintBrushIcon,
    render: () => <Appearance />,
  },
  {
    id: 'shortcuts',
    label: 'Shortcuts',
    icon: KeyboardIcon,
    render: () => <Shortcuts />,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: BellIcon,
    render: () => <Notifications />,
  },
  {
    id: 'team',
    label: 'Team',
    icon: UsersThreeIcon,
    render: () => <Team />,
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: RobotIcon,
    render: () => <Agent />,
  },
];

/**
 * Settings modal: vertical nav on the left, content on the right.
 * Title sits in the top-left of the content header; close lives in the top-right.
 * When the user pops the theme picker out, the modal chrome dims to let the rest
 * of the UI show through and a floating swatch pane appears at the bottom-right.
 */
export function SettingsModal() {
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setThemePickerFloating(false);
    }
    setSettingsModalOpen(open);
  };

  return (
    <Dialog
      open={settingsModalOpen()}
      onOpenChange={onOpenChange}
      position="center"
      class={cn(
        'w-[min(1200px,calc(100vw-48px))] h-[min(840px,calc(100vh-48px))] max-w-none bg-transparent shadow-none transition-opacity duration-150',
        themePickerFloating() ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <Show
        when={!themePickerFloating()}
        fallback={<FloatingThemePicker />}
      >
        <Surface
          depth={1}
          class="size-full rounded-xl shadow-2xl shadow-drop-shadow"
        >
          <SettingsModalContent />
        </Surface>
      </Show>
    </Dialog>
  );
}

function SettingsModalContent() {
  return (
    <div class="flex size-full min-h-0">
      <SettingsSidebar />
      <SettingsContent />
    </div>
  );
}

function SettingsSidebar() {
  const logout = useLogout();
  return (
    <Layer depth={2}>
    <nav
      class="w-64 shrink-0 flex flex-col p-3 gap-1 overflow-y-auto bg-surface border-r border-edge-muted"
      aria-label="Settings sections"
    >
      <h1 class="flex items-center gap-2 px-2 pt-1 pb-4 text-base font-semibold text-ink select-none">
        <MacroLogo class="size-4 text-accent" />
        Settings
      </h1>
      <For each={TABS}>
        {(tab) => (
          <button
            type="button"
            class={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left cursor-default',
              settingsModalTab() === tab.id
                ? 'bg-ink/8 text-ink font-medium'
                : 'text-ink-extra-muted hover:bg-ink/5 hover:text-ink'
            )}
            data-active={settingsModalTab() === tab.id || undefined}
            onClick={() => setSettingsModalTab(tab.id)}
          >
            <Dynamic component={tab.icon} class="size-4 shrink-0" />
            <span class="flex-1 truncate">{tab.label}</span>
          </button>
        )}
      </For>
      <div class="mt-auto pt-2 flex flex-col gap-0.5 after:content-[''] after:block after:h-px after:mx-2 after:mt-2 after:bg-edge-muted/40">
        <a
          href="https://github.com/macro-inc/macro"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-extra-muted hover:bg-ink/5 hover:text-ink transition-colors text-left cursor-default"
        >
          <GithubLogoIcon class="size-4 shrink-0" />
          <span class="flex-1 truncate">GitHub</span>
          <ArrowSquareOutIcon class="size-3 shrink-0 opacity-70" />
        </a>
        <a
          href="https://apps.apple.com/us/app/macro-app/id6743133649"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-extra-muted hover:bg-ink/5 hover:text-ink transition-colors text-left cursor-default"
        >
          <DeviceMobileIcon class="size-4 shrink-0" />
          <span class="flex-1 truncate">Mobile app</span>
          <ArrowSquareOutIcon class="size-3 shrink-0 opacity-70" />
        </a>
        <a
          href="https://github.com/macro-inc/macro/releases/latest"
          target="_blank"
          rel="noopener noreferrer"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-ink-extra-muted hover:bg-ink/5 hover:text-ink transition-colors text-left cursor-default"
        >
          <TagIcon class="size-4 shrink-0" />
          <span class="flex-1 truncate">Latest release</span>
          <ArrowSquareOutIcon class="size-3 shrink-0 opacity-70" />
        </a>
      </div>
      <div class="mt-2">
        <button
          type="button"
          class="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-failure hover:bg-failure-bg transition-colors text-left cursor-default"
          onClick={() => {
            void logout();
          }}
        >
          <SignOutIcon class="size-4 shrink-0" />
          <span class="flex-1 truncate">Log out</span>
        </button>
      </div>
    </nav>
    </Layer>
  );
}

function SettingsContent() {
  return (
      <section class="flex-1 min-w-0 flex flex-col overflow-auto">
        <header class="shrink-0 flex items-center justify-between gap-3 px-4 py-2 border-b border-edge-muted">
          <h2 class="text-base font-semibold text-ink select-none">
            <For each={TABS}>
              {(tab) => (
                <Show when={settingsModalTab() === tab.id}>{tab.label}</Show>
              )}
            </For>
          </h2>
          <Dialog.CloseButton
            as={Button}
            variant="ghost"
            size="icon-sm"
            tooltip="Close (Esc)"
            aria-label="Close settings"
          >
            <XIcon />
          </Dialog.CloseButton>
        </header>
        <div class="flex-1 min-h-0 p-4">
          <Suspense>
            <For each={TABS}>
              {(tab) => (
                <Show when={settingsModalTab() === tab.id}>{tab.render()}</Show>
              )}
            </For>
          </Suspense>
        </div>
      </section>
  );
}

/**
 * Floating compact picker shown when the user pops the theme picker out of the
 * modal. The settings modal itself is rendered transparent so this pane sits
 * over the live UI for previewing color changes.
 */
function FloatingThemePicker() {
  return (
    <div
      class="pointer-events-auto fixed bottom-4 right-4 z-modal w-80 max-w-[calc(100vw-32px)] rounded-xl bg-surface border border-edge-muted shadow-2xl shadow-drop-shadow flex flex-col overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <header class="shrink-0 flex items-center justify-between gap-2 h-10 px-3 border-b border-edge-muted">
        <div class="flex items-center gap-2 text-sm font-medium text-ink">
          <PaintBrushIcon class="size-3.5 text-ink-muted" />
          Theme
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          tooltip="Back to settings"
          onClick={() => setThemePickerFloating(false)}
        >
          <XIcon />
        </Button>
      </header>
      <div class="flex-1 min-h-0 overflow-auto">
        <Appearance />
      </div>
    </div>
  );
}
