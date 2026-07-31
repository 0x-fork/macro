import { CommandState } from '@app/features/command';
import { useLogout } from '@core/auth/logout';
import { UserIcon } from '@core/component/UserIcon';
import type { SettingsTab } from '@core/constant/SettingsState';
import { useEmail, useUserId } from '@core/context/user';
import { TOKENS } from '@core/hotkey/tokens';
import GearIcon from '@phosphor/gear.svg';
import SignOutIcon from '@phosphor/sign-out.svg';
import { isRealNamePart, useOwnUserName } from '@queries/auth/user-name-self';
import { cn, Dropdown, Hotkey } from '@ui';
import { createMemo, Show } from 'solid-js';

type SidebarSettingsWidgetProps = {
  /** Tooltip-only mode: the wide row shows the name inline, the rail doesn't. */
  isSlim: () => boolean;
  onSelect: (tab: SettingsTab) => void;
  onMenuOpenChange?: (open: boolean) => void;
  /** `row` is the wide sidebar's full-width row; `rail` is the narrow avatar tile. */
  variant?: 'row' | 'rail';
};

/** The account row (or rail tile) that opens the settings / log out menu. */
export const SidebarSettingsWidget = (props: SidebarSettingsWidgetProps) => {
  const userId = useUserId();
  const email = useEmail();
  const logout = useLogout();

  const userName = useOwnUserName();
  const isRail = () => props.variant === 'rail';

  // Prefer the user's real name (first/last); fall back to their email.
  const displayName = createMemo(() => {
    const name = userName();
    const parts = [name?.first_name, name?.last_name]
      .map((part) => part?.trim())
      .filter((part): part is string => isRealNamePart(part));
    return parts.length > 0 ? parts.join(' ') : (email() ?? 'Macro User');
  });

  return (
    <Dropdown
      placement={isRail() ? 'right-end' : 'top-start'}
      gutter={6}
      onOpenChange={props.onMenuOpenChange}
    >
      <Dropdown.Trigger
        variant="ghost"
        class={cn(
          'flex items-center rounded-md cursor-default text-ink-extra-muted not-disabled:hover:bg-ink/3 h-9',
          isRail()
            ? 'size-9 justify-center p-0'
            : 'justify-start gap-3 px-1.5 py-1'
        )}
        label={displayName()}
        fullWidth={!isRail()}
        tooltipDisabled={!isRail() && !props.isSlim()}
        tooltipPlacement="right"
        onMouseDown={(e: MouseEvent) => {
          if (e.button !== 0) return;
          e.preventDefault();
        }}
      >
        <Show
          when={userId()}
          fallback={<div class="size-5 shrink-0 rounded-full bg-ink/10" />}
        >
          {(id) => (
            <div class={isRail() ? 'size-6 shrink-0' : 'size-5 shrink-0'}>
              <UserIcon
                id={id()}
                size="fill"
                suppressClick
                showTooltip={false}
              />
            </div>
          )}
        </Show>
        <Show when={!isRail()}>
          <span class="flex-1 min-w-0 text-left whitespace-nowrap text-sm truncate group-data-[slim=true]/sidebar:hidden">
            {displayName()}
          </span>
        </Show>
      </Dropdown.Trigger>
      <Dropdown.Content class="min-w-64 shadow-menu">
        <Dropdown.Group class="p-1.5 gap-0">
          <div class="flex items-center gap-3 px-1 py-1">
            <Show
              when={userId()}
              fallback={<div class="size-10 shrink-0 rounded-full bg-ink/10" />}
            >
              {(id) => (
                <div class="size-10 shrink-0">
                  <UserIcon
                    id={id()}
                    size="fill"
                    suppressClick
                    showTooltip={false}
                  />
                </div>
              )}
            </Show>
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-ink">
                {displayName()}
              </div>
              <div class="truncate text-sm text-ink-muted">{email()}</div>
            </div>
          </div>
          <div class="-mx-1.5 mt-2 mb-1.5 h-px bg-edge-muted" />
          <Dropdown.Item
            class="flex items-center gap-2 px-2.5 py-2 text-sm cursor-default outline-none text-ink-muted"
            onSelect={() => CommandState.open()}
          >
            <span class="size-5 flex items-center justify-center text-ink-extra-muted">
              ⌘
            </span>
            <span class="flex-1 text-ink">Command menu</span>
            <Hotkey
              token={TOKENS.global.commandMenu}
              theme="subtle"
              class="ml-6"
            />
          </Dropdown.Item>
          <Dropdown.Item
            class="flex items-center gap-2 px-2.5 py-2 text-sm cursor-default outline-none text-ink-muted"
            onSelect={() => props.onSelect('Account')}
          >
            <span class="size-5 flex items-center justify-center">
              <GearIcon class="size-4 shrink-0 text-ink-extra-muted" />
            </span>
            <span class="flex-1 text-ink">Settings</span>
            <Hotkey
              token={TOKENS.global.toggleSettings}
              theme="subtle"
              class="ml-6"
            />
          </Dropdown.Item>
          <Dropdown.Item
            class="flex items-center gap-2 px-2.5 py-2 text-sm cursor-default outline-none text-failure"
            onSelect={() => logout()}
          >
            <span class="size-5 flex items-center justify-center">
              <SignOutIcon class="size-4 shrink-0" />
            </span>
            <span>Log out</span>
          </Dropdown.Item>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
};
