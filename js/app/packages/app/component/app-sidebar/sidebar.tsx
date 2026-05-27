import { useAnalytics } from '@app/component/analytics-context';
import { ChannelsUnreadWidget } from '@app/component/app-sidebar/channels-unread-widget';
import {
  InviteModal,
  setInviteModalOpen,
} from '@app/component/app-sidebar/invite-modal';
import { CommandState } from '@app/component/command';
import { createMenuOpen, setCreateMenuOpen } from '@app/component/Launcher';
import { requestSearchFocus } from '@app/component/next-soup/soup-view/search-controllers';
import { useSplitLayout } from '@app/component/split-layout/layout';
import type {
  ReferredFrom,
  SplitContent,
  SplitHandle,
} from '@app/component/split-layout/layoutManager';
import { GO_TO_COMMAND_SCOPE, GO_TO_LEADER_KEY } from '@app/constants/hotkeys';
import { LIST_VIEW_PATHS, type ListView } from '@app/constants/list-views';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { useHotkeyInterceptor } from '@app/signal/hotkeyRoot';
import { globalSplitManager } from '@app/signal/splitLayout';
import { InCallPanel } from '@channel/Call';
import { useCallContextOptional } from '@channel/Call/CallContext';
import { useHasPaidAccess } from '@core/auth';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import { UserIcon } from '@core/component/UserIcon';
import {
  DEV_MODE_ENV,
  ENABLE_APP_STORE_QR_CODE,
  ENABLE_CALLS,
  ENABLE_NEW_PRICING_OVERRIDE,
  ENABLE_TEAMS_OVERRIDE,
} from '@core/constant/featureFlags';
import {
  type SettingsTab,
  useSettingsState,
} from '@core/constant/SettingsState';
import { useUserId } from '@core/context/user';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { clearPressedKeys } from '@core/hotkey/state';
import { type HotkeyToken, TOKENS } from '@core/hotkey/tokens';
import type { ValidHotkey } from '@core/hotkey/types';
import { activateClosestDOMScope } from '@core/hotkey/utils';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { ContextMenu } from '@kobalte/core/context-menu';
import LogoIcon from '@icon/macro-logo.svg';
import SquareSidebarIcon from '@icon/square-sidebar.svg';
import { AnimatedSignalIcon } from '@icon/wide-signal';
import PlusIcon from '@phosphor/plus.svg';
import XIcon from '@phosphor/x.svg';
import { AnimatedCallIcon } from '@icon/wide-call';
import { AnimatedChannelIcon } from '@icon/wide-channel';
import CommandIcon from '@phosphor/command.svg';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedFolderIcon } from '@icon/wide-folder';
import { AnimatedInboxIcon } from '@icon/wide-inbox';
import { AnimatedSearchIcon } from '@icon/wide-search';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import { AnimatedUsersIcon } from '@icon/wide-users';
import { useNotificationSettings } from '@notifications';
import BellIcon from '@phosphor/bell.svg';
import CaretUpIcon from '@phosphor/caret-up.svg';
import DeviceMobileIcon from '@phosphor/device-mobile-speaker.svg';
import KeyboardIcon from '@phosphor/keyboard.svg';
import PaintBucketIcon from '@phosphor/paint-bucket.svg';
import PlugIcon from '@phosphor/plug.svg';
import UserIconPhosphor from '@phosphor/user.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import { debounce } from '@solid-primitives/scheduled';
import { makePersisted } from '@solid-primitives/storage';
import { useLocation } from '@solidjs/router';
import { Button, cn, Dropdown, Hotkey, Layer } from '@ui';
import { useLogout } from '@core/auth/logout';
import { useEmail } from '@core/context/user';
import { useDisplayName, tryMacroId } from '@core/user';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CheckCircleIcon from '@phosphor/check-circle.svg';
import GearIcon from '@phosphor/gear.svg';
import SignOutIcon from '@phosphor/sign-out.svg';
import AppStoreQr from '@design/app-store-qr.svg';
import {
  type Component,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';

interface SidebarItem {
  id: ListView;
  label: string;
  href: string;
  icon?: Component<
    JSX.SvgSVGAttributes<SVGSVGElement> | { triggerAnimation?: boolean }
  >;
  hotkey: ValidHotkey;
  hotkeyToken: HotkeyToken;
  standaloneHotkey?: boolean;
}

const SIDEBAR_LINKS = [
  {
    id: 'notifications',
    label: 'Notifications',
    href: LIST_VIEW_PATHS.notifications,
    icon: AnimatedSignalIcon,
    hotkey: 'n',
    hotkeyToken: TOKENS.sidebar.goTo.notifications,
  },
  {
    id: 'inbox',
    label: 'Inbox',
    href: LIST_VIEW_PATHS.inbox,
    icon: AnimatedInboxIcon,
    hotkey: 'i',
    hotkeyToken: TOKENS.sidebar.goTo.inbox,
  },
  {
    id: 'search',
    label: 'Search',
    href: LIST_VIEW_PATHS.search,
    icon: AnimatedSearchIcon,
    hotkey: '/',
    hotkeyToken: TOKENS.sidebar.goTo.search,
    standaloneHotkey: true,
  },
  {
    id: 'agents',
    label: 'Agents',
    href: LIST_VIEW_PATHS.agents,
    icon: AnimatedStarIcon,
    hotkey: 'a',
    hotkeyToken: TOKENS.sidebar.goTo.agents,
  },
  {
    id: 'mail',
    label: 'Email',
    href: LIST_VIEW_PATHS.mail,
    icon: AnimatedEmailIcon,
    hotkey: 'e',
    hotkeyToken: TOKENS.sidebar.goTo.mail,
  },
  {
    id: 'documents',
    label: 'Documents',
    href: LIST_VIEW_PATHS.documents,
    icon: AnimatedFileMdIcon,
    hotkey: 'd',
    hotkeyToken: TOKENS.sidebar.goTo.documents,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    href: LIST_VIEW_PATHS.tasks,
    icon: AnimatedTaskIcon,
    hotkey: 't',
    hotkeyToken: TOKENS.sidebar.goTo.tasks,
  },
  {
    id: 'channels',
    label: 'Channels',
    href: LIST_VIEW_PATHS.channels,
    icon: AnimatedChannelIcon,
    hotkey: 'c',
    hotkeyToken: TOKENS.sidebar.goTo.channels,
  },
  {
    id: 'folders',
    label: 'Folders',
    href: LIST_VIEW_PATHS.folders,
    icon: AnimatedFolderIcon,
    hotkey: 'f',
    hotkeyToken: TOKENS.sidebar.goTo.folders,
  },
] satisfies SidebarItem[];

export type SidebarState = 'hidden' | 'expanded' | 'slim';

/** Root sidebar `max-width` transition (see `SIDEBAR_MAX_WIDTH_TRANSITION_STYLE`). */
const SIDEBAR_MAX_WIDTH_TRANSITION_MS = 100;
const SIDEBAR_MAX_WIDTH_TRANSITION_STYLE = `max-width ease-in-out ${SIDEBAR_MAX_WIDTH_TRANSITION_MS}ms`;

/**
 * InCallPanel stays in slim layout until the sidebar shell finishes widening.
 * Uses `transitionend` on that element’s `max-width` (no timer on the happy path);
 * a short fallback timeout covers reduced-motion / no-op layout.
 */
function createInCallPanelSlimToggle(args: {
  initialSlim: boolean;
  parentOnOpenChange: (open: boolean) => void;
  getShell: () => HTMLDivElement | undefined;
}) {
  const [panelIsSlim, setPanelIsSlim] = createSignal(args.initialSlim);
  let shellEl: HTMLDivElement | undefined;
  let onMaxWidthEnd: ((e: TransitionEvent) => void) | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;

  const detachExpandTracking = () => {
    const el = shellEl;
    const handler = onMaxWidthEnd;
    shellEl = undefined;
    onMaxWidthEnd = undefined;
    if (el && handler) {
      el.removeEventListener('transitionend', handler);
    }
    if (fallbackTimer !== undefined) {
      globalThis.clearTimeout(fallbackTimer);
      fallbackTimer = undefined;
    }
  };

  const finishExpand = () => {
    detachExpandTracking();
    setPanelIsSlim(false);
  };

  onCleanup(detachExpandTracking);

  return {
    panelIsSlim,
    handleSidebarOpenChange(open: boolean) {
      detachExpandTracking();

      if (!open) {
        setPanelIsSlim(true);
        args.parentOnOpenChange(open);
        return;
      }

      args.parentOnOpenChange(open);

      requestAnimationFrame(() => {
        const el = args.getShell();
        if (!el) {
          setPanelIsSlim(false);
          return;
        }

        const onEnd = (e: TransitionEvent) => {
          if (e.propertyName !== 'max-width' || e.target !== el) return;
          finishExpand();
        };

        shellEl = el;
        onMaxWidthEnd = onEnd;
        el.addEventListener('transitionend', onEnd);

        fallbackTimer = globalThis.setTimeout(
          finishExpand,
          SIDEBAR_MAX_WIDTH_TRANSITION_MS + 80
        );
      });
    },
  } as const;
}

type AppSidebarProps = {
  sidebarState?: SidebarState;
  onOpenChange: (open: boolean) => void;
};

type SidebarHotkeyDeps = {
  links: SidebarItem[];
  hotkeyVisible: () => boolean;
  setHotkeyVisible: (visible: boolean) => void;
  resetHotkeysState: VoidFunction;
  isSlim: () => boolean;
  onOpenChange: (open: boolean) => void;
  openWithSplit: ReturnType<typeof useSplitLayout>['openWithSplit'];
};

type OpenWithSplitFn = ReturnType<typeof useSplitLayout>['openWithSplit'];

const isComponentEntry =
  (id: ListView) =>
  (entry: SplitContent): boolean =>
    entry.type === 'component' && entry.id === id;

/**
 * Navigate to a sidebar view, preserving prior state when possible.
 *
 * If the active split's history already contains an entry for this view, jump
 * back to it so search text, filters, preview state, etc. are restored from
 * that entry. Otherwise push a fresh entry. Holding shift bypasses the lookup
 * and forces a new entry / new split.
 */
function navigateToSidebarView(args: {
  viewId: ListView;
  shiftKey: boolean;
  activeSplit: SplitHandle | undefined;
  openWithSplit: OpenWithSplitFn;
  referredFrom?: ReferredFrom;
}): SplitHandle | undefined {
  const { viewId, shiftKey, activeSplit, openWithSplit, referredFrom } = args;

  if (!shiftKey && activeSplit?.goToEntry(isComponentEntry(viewId))) {
    return activeSplit;
  }

  return openWithSplit(
    { type: 'component', id: viewId },
    {
      preferNewSplit: shiftKey,
      mergeHistory: false,
      allowDuplicate: true,
      referredFrom,
    }
  );
}

const registerSidebarHotkeys = ({
  links,
  isSlim,
  onOpenChange,
  openWithSplit,
  hotkeyVisible,
  setHotkeyVisible,
  resetHotkeysState,
}: SidebarHotkeyDeps) => {
  const debounceResetHotkeysState = debounce(resetHotkeysState, 2000);
  const debounceSetHotkeyVisible = debounce(() => setHotkeyVisible(true), 200);

  // Register 'g' as a leader key that activates the global GO_TO command scope
  registerHotkey({
    hotkey: GO_TO_LEADER_KEY,
    scopeId: 'global',
    hotkeyToken: TOKENS.sidebar.goToLeader,
    description: 'Go to page',
    keyDownHandler: () => {
      // We debounce the time till the hot keys are visible to allow other commands
      // like g+g to fire
      debounceSetHotkeyVisible();
      debounceResetHotkeysState();
      return true;
    },
    activateCommandScopeId: GO_TO_COMMAND_SCOPE,
    hide: true,
    registrationType: 'add',
  });

  const registeredGoToKeys = new Set<ValidHotkey>([
    ...links.map((link) => link.hotkey),
  ]);

  // When the go to command scope is active, we want to prevent
  // other default hotkeys from running. So doing "g" + some key
  // not part of the sidebar hotkeys, won't fire the command
  // for the key
  useHotkeyInterceptor((context) => {
    // If a hotkey is going to be fired, but the hotkeys are not
    // visible, then it's not a sidebar nav hotkey and we can
    // ignore it and reset our visible state
    if (!hotkeyVisible()) {
      debounceSetHotkeyVisible.clear();
      return false;
    }

    if (context.eventType !== 'keydown') return false;

    if (
      context.activeScopeId !== GO_TO_COMMAND_SCOPE ||
      registeredGoToKeys.has(context.pressedKeysString)
    ) {
      return false;
    }

    resetHotkeysState();
    debounceResetHotkeysState.clear();

    return true;
  });

  registerHotkey({
    scopeId: 'global',
    hotkeyToken: TOKENS.global.inviteTeam,
    description: 'Send Invites',
    keyDownHandler: (e) => {
      e?.preventDefault();
      setInviteModalOpen(true);
      return true;
    },
  });

  registerHotkey({
    hotkey: 'cmd+.',
    scopeId: 'global',
    hotkeyToken: TOKENS.global.toggleSidebar,
    description: 'Toggle sidebar',
    runWithInputFocused: true,
    keyDownHandler: (e) => {
      e?.preventDefault();
      onOpenChange(isSlim());
      return true;
    },
  });

  // Register navigation shortcuts in the global GO_TO command scope
  for (const link of links) {
    const openSidebarView = (e?: KeyboardEvent) => {
      e?.preventDefault();
      if (hotkeyVisible()) {
        resetHotkeysState();
        debounceResetHotkeysState.clear();
      }

      if (link.id === 'search' && !e?.shiftKey) {
        const activeSplit = globalSplitManager()?.activeSplit();
        const content = activeSplit?.content();
        if (
          activeSplit &&
          content?.type === 'component' &&
          content.id === 'search'
        ) {
          requestSearchFocus(activeSplit.id);
          return true;
        }
      }

      const handle = navigateToSidebarView({
        viewId: link.id,
        shiftKey: !!e?.shiftKey,
        activeSplit: globalSplitManager()?.activeSplit(),
        openWithSplit,
      });
      if (link.id === 'search' && handle) {
        requestSearchFocus(handle.id);
      }
      return true;
    };

    registerHotkey({
      hotkey: link.hotkey,
      scopeId: link.standaloneHotkey ? 'global' : GO_TO_COMMAND_SCOPE,
      hotkeyToken: link.hotkeyToken,
      description: `Go to ${link.label}`,
      keyDownHandler: openSidebarView,
      icon: link.icon,
    });
  }
};

/** Persisted dismissals for the bottom-of-sidebar promo cards. */
const [inviteCardDismissed, setInviteCardDismissed] = makePersisted(
  createSignal<boolean>(false),
  { name: 'sidebar-invite-card-dismissed' }
);
const [notificationsCardDismissed, setNotificationsCardDismissed] =
  makePersisted(createSignal<boolean>(false), {
    name: 'sidebar-notifications-card-dismissed',
  });
const [mobileAppCardDismissed, setMobileAppCardDismissed] = makePersisted(
  createSignal<boolean>(false),
  { name: 'sidebar-mobile-app-card-dismissed' }
);

/**
 * Compact horizontal version of the MobileApp settings card. Slot it above the
 * user menu so phone-less users get a nudge without taking up the QR-scale real
 * estate the settings panel uses.
 */
const SidebarMobileAppCard = (props: {
  isSlim: () => boolean;
  onDismiss: () => void;
}) => {
  return (
    <Show when={!props.isSlim()}>
      <div class="relative group/promo w-full rounded-md border border-edge-muted bg-ink/3 hover:bg-ink/5 transition-colors p-2">
        <a
          href="https://apps.apple.com/us/app/macro-app/id6743133649"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Download Macro on the App Store"
          class="flex items-center gap-2"
        >
          <div class="shrink-0 size-14 rounded-sm bg-surface flex items-center justify-center overflow-hidden p-1 text-ink">
            <AppStoreQr style="display: block; width: 100%; height: 100%;" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-medium text-ink leading-tight">
              Get the iOS app
            </div>
            <div class="text-xxs text-ink-extra-muted leading-snug">
              Scan to download
            </div>
          </div>
        </a>
        <button
          type="button"
          class="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface border border-edge-muted shadow-sm flex items-center justify-center text-ink-muted hover:text-ink hover:bg-hover opacity-0 group-hover/promo:opacity-100 transition-opacity"
          aria-label="Dismiss mobile app card"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            props.onDismiss();
          }}
        >
          <XIcon class="size-2.5" />
        </button>
      </div>
    </Show>
  );
};

/** Session-only signals so a hint shows after dismissal until the user acknowledges or the timer expires. */
const [inviteHintVisible, setInviteHintVisible] = createSignal(false);
const [notificationsHintVisible, setNotificationsHintVisible] = createSignal(false);

const PROMO_HINT_DURATION_MS = 8000;

type SidebarPromoHintProps = {
  title: string;
  message: string;
  isSlim: () => boolean;
  onDone: () => void;
};

/** Fading post-dismissal hint with a "Got it" button. */
const SidebarPromoHint = (props: SidebarPromoHintProps) => {
  const [fading, setFading] = createSignal(false);

  onMount(() => {
    const fadeTimer = setTimeout(() => setFading(true), PROMO_HINT_DURATION_MS - 400);
    const doneTimer = setTimeout(props.onDone, PROMO_HINT_DURATION_MS);
    onCleanup(() => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    });
  });

  return (
    <Show when={!props.isSlim()}>
      <div
        class={cn(
          'w-full rounded-md border border-edge-muted bg-ink/3 px-2.5 py-2 flex flex-col gap-2 transition-opacity duration-300',
          fading() ? 'opacity-0' : 'opacity-100'
        )}
      >
        <div class="flex items-center gap-2 min-w-0">
          <CheckCircleIcon class="shrink-0 size-4 text-success" />
          <div class="flex-1 min-w-0 text-xs font-medium text-ink leading-tight">
            {props.title}
          </div>
        </div>
        <div class="text-xxs text-ink-extra-muted leading-snug">
          {props.message}
        </div>
        <div class="flex items-center justify-end">
          <button
            type="button"
            class="text-xxs font-medium px-2 py-1 rounded-sm text-ink-muted hover:text-ink hover:bg-ink/5 transition-colors"
            onClick={props.onDone}
          >
            Got it
          </button>
        </div>
      </div>
    </Show>
  );
};

type SidebarPromoCardAction = {
  label: string;
  onClick: () => void;
};

type SidebarPromoCardProps = {
  label: string;
  description: string;
  isSlim: () => boolean;
  onDismiss: () => void;
  icon: Component<{ triggerAnimation?: boolean; class?: string }>;
  /** When set, the whole card body is a button. */
  onClick?: () => void;
  /** When set, render a row of action buttons instead of a clickable body. */
  primaryAction?: SidebarPromoCardAction;
  secondaryAction?: SidebarPromoCardAction;
};

/**
 * Compact, dismissable card shown near the bottom of the sidebar.
 * Slim mode falls back to a single icon button (no card chrome).
 */
const SidebarPromoCard = (props: SidebarPromoCardProps) => {
  const [hovering, setHovering] = createSignal(false);

  return (
    <Show when={!props.isSlim()}>
      <div
        class={cn(
          'relative group/promo w-full rounded-md border border-edge-muted bg-ink/3 transition-colors',
          props.onClick && 'hover:bg-ink/5'
        )}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <Dynamic
          component={props.onClick ? 'button' : 'div'}
          type={props.onClick ? 'button' : undefined}
          class={cn(
            'w-full text-left flex flex-col gap-2 px-2.5 py-2',
            props.onClick && 'cursor-default'
          )}
          onClick={props.onClick}
        >
          <div class="flex items-start gap-2 min-w-0">
            <div class="shrink-0 mt-0.5 text-ink-muted [&_svg]:size-4">
              <Dynamic component={props.icon} triggerAnimation={hovering()} />
            </div>
            <div class="flex-1 min-w-0 text-xs font-medium text-ink leading-tight">
              {props.label}
            </div>
          </div>
          <div class="text-xxs text-ink-extra-muted leading-snug">
            {props.description}
          </div>
          <Show when={props.primaryAction || props.secondaryAction}>
            <div class="flex items-center justify-end gap-1.5 mt-1.5">
              <Show when={props.secondaryAction}>
                {(action) => (
                  <button
                    type="button"
                    class="text-xxs text-ink-muted px-2 py-1 rounded-sm hover:text-ink hover:bg-ink/5 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      action().onClick();
                    }}
                  >
                    {action().label}
                  </button>
                )}
              </Show>
              <Show when={props.primaryAction}>
                {(action) => (
                  <button
                    type="button"
                    class="text-xxs font-medium px-2 py-1 rounded-sm bg-accent text-surface hover:bg-accent/90 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      action().onClick();
                    }}
                  >
                    {action().label}
                  </button>
                )}
              </Show>
            </div>
          </Show>
        </Dynamic>
        <button
          type="button"
          class="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-surface border border-edge-muted shadow-sm flex items-center justify-center text-ink-muted hover:text-ink hover:bg-hover opacity-0 group-hover/promo:opacity-100 transition-opacity"
          aria-label={`Dismiss ${props.label}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onDismiss();
          }}
        >
          <XIcon class="size-2.5" />
        </button>
      </div>
    </Show>
  );
};
/** Session-only signal so a hint shows after dismissal until the user acknowledges or the timer expires. */
const [premiumHintVisible, setPremiumHintVisible] = createSignal(false);

type SidebarActionButtonProps = {
  icon: Component<{ triggerAnimation?: boolean; class?: string }>;
  onClick: (event?: MouseEvent) => void;
  disabled?: boolean | (() => boolean);
  hotkeyToken?: HotkeyToken;
  isSlim: () => boolean;
  label: string;
};

type SidebarShortcutLinkProps = {
  label: string;
  icon: Component<{ triggerAnimation?: boolean; class?: string }>;
  onClick: () => void;
  isSlim: () => boolean;
};

const SidebarShortcutLink = (props: SidebarShortcutLinkProps) => {
  const [isHovering, setIsHovering] = createSignal(false);

  return (
    <Button
      draggable={false}
      variant="ghost"
      class={cn(
        'flex items-center justify-start text-sm gap-2 cursor-default w-full rounded-md py-1 text-ink-extra-muted not-disabled:hover:bg-ink/3'
      )}
      tooltipPlacement="right"
      label={props.isSlim() ? props.label : undefined}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        props.onClick();
      }}
    >
      <div class="relative shrink-0 [&_svg]:size-4">
        <Dynamic component={props.icon} triggerAnimation={isHovering()} />
      </div>

      <div class="flex items-center gap-1 group-data-[slim=true]/sidebar:hidden">
        <span class="whitespace-nowrap">{props.label}</span>
      </div>
    </Button>
  );
};

type SettingsMenuItem = {
  tab: SettingsTab;
  label: string;
  icon: Component<{ class?: string }>;
};

const SETTINGS_MENU_TOP_ITEMS: SettingsMenuItem[] = [
  {
    tab: 'Mobile App',
    label: 'App',
    icon: DeviceMobileIcon,
  },
  {
    tab: 'Agent',
    label: 'MCPs',
    icon: PlugIcon,
  },
  {
    tab: 'Team',
    label: 'Team',
    icon: UsersThreeIcon,
  },
];

const SETTINGS_MENU_BOTTOM_ITEMS: SettingsMenuItem[] = [
  {
    tab: 'Shortcuts',
    label: 'Shortcuts',
    icon: KeyboardIcon,
  },
  {
    tab: 'Appearance',
    label: 'Appearance',
    icon: PaintBucketIcon,
  },
  {
    tab: 'Account',
    label: 'Account',
    icon: UserIconPhosphor,
  },
];

/**
 * Mirrors the gating in `Settings.tsx`'s `settingsTabs()`. Use to filter the
 * sidebar menu/shortcuts and to guard `setActiveTabId` callers so we never
 * activate a tab that the settings panel won't render.
 */
const useIsSettingsTabAvailable = () => {
  const teamsFlag = useFeatureFlag('enable-teams-settings', {
    enabledOverride: ENABLE_TEAMS_OVERRIDE,
  });

  return (tab: SettingsTab): boolean => {
    switch (tab) {
      case 'Appearance':
      case 'Account':
        return true;
      case 'Team':
        return teamsFlag().enabled;
      case 'Shortcuts':
        return !isTouchDevice();
      case 'Mobile App':
        return ENABLE_APP_STORE_QR_CODE && !isNativeMobilePlatform();
      case 'Agent':
        return !isNativeMobilePlatform();
      case 'Mobile':
        return isNativeMobilePlatform() && DEV_MODE_ENV;
      default:
        return false;
    }
  };
};

/**
 * A normalised action button for the sidebar footer area.
 *
 * Mirrors the tooltip behaviour of `SidebarLink`:
 * - slim  → show tooltip (label + hotkey)
 * - expanded → no tooltip (label and hotkey badge are visible inline)
 */
const SidebarActionButton = (props: SidebarActionButtonProps) => {
  const [hovering, setHovering] = createSignal(false);

  const isDisabled = () =>
    typeof props.disabled === 'function'
      ? props.disabled()
      : (props.disabled ?? false);

  return (
    <Button
      size="sm"
      class="flex items-center justify-start group-data-[slim=true]/sidebar:justify-center text-xs gap-2 cursor-default w-full rounded-xs py-1 [&_svg]:size-4"
      variant="ghost"
      tooltipPlacement="right"
      label={props.isSlim() ? props.label : undefined}
      hotkey={props.isSlim() ? props.hotkeyToken : undefined}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
      }}
      onClick={(event: MouseEvent) => props.onClick(event)}
      disabled={isDisabled()}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div class="shrink-0">
        <Dynamic component={props.icon} triggerAnimation={hovering()} />
      </div>
      <span class="whitespace-nowrap group-data-[slim=true]/sidebar:hidden">
        {props.label}
      </span>
      <Show when={hovering() && props.hotkeyToken}>
        {(token) => (
          <div class="text-xxs text-ink-extra-muted/50 rounded-sm ml-auto border border-ink/5 px-1.5 py-px -my-1 group-data-[slim=true]/sidebar:hidden">
            <Hotkey token={token()} class="flex gap-1" />
          </div>
        )}
      </Show>
    </Button>
  );
};

type SidebarCreateButtonProps = {
  label: string;
  hotkeyToken?: HotkeyToken;
  isSlim: () => boolean;
  onClick: () => void;
  icon: () => JSX.Element;
};

const SidebarCreateButton = (props: SidebarCreateButtonProps) => {
  return (
    <Button
      class="flex items-center justify-start group-data-[slim=true]/sidebar:justify-center text-xs gap-1.5 cursor-default w-full rounded-md py-2 bg-ink/5 hover:bg-ink/10 group-data-[slim=true]/sidebar:py-0 group-data-[slim=true]/sidebar:aspect-square [&_svg]:size-4"
      variant="ghost"
      tooltipPlacement="right"
      label={props.isSlim() ? props.label : undefined}
      hotkey={props.isSlim() ? props.hotkeyToken : undefined}
      onClick={props.onClick}
    >
      <div class="shrink-0">{props.icon()}</div>
      <span class="whitespace-nowrap group-data-[slim=true]/sidebar:hidden">
        {props.label}
      </span>
      <Show when={props.hotkeyToken}>
        {(token) => (
          <div class="text-xxs text-ink-extra-muted/50 rounded-sm ml-auto border border-ink/5 px-1.5 py-px -my-1 group-data-[slim=true]/sidebar:hidden">
            <Hotkey token={token()} class="flex gap-1" />
          </div>
        )}
      </Show>
    </Button>
  );
};

type SidebarIconButtonProps = {
  label: string;
  hotkeyToken?: HotkeyToken;
  onClick: () => void;
  disabled?: boolean | (() => boolean);
  icon: Component<{ triggerAnimation?: boolean; class?: string }>;
  isSlim: () => boolean;
};

const SidebarIconButton = (props: SidebarIconButtonProps) => {
  const [hovering, setHovering] = createSignal(false);

  const isDisabled = () =>
    typeof props.disabled === 'function'
      ? props.disabled()
      : (props.disabled ?? false);

  return (
    <Button
      size="sm"
      class="flex items-center justify-center size-6 p-1 rounded-md [&_svg]:size-3.5"
      variant="ghost"
      tooltipPlacement="top"
      label={props.label}
      hotkey={props.hotkeyToken}
      onClick={props.onClick}
      disabled={isDisabled()}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div class="shrink-0">
        <Dynamic component={props.icon} triggerAnimation={hovering()} />
      </div>
    </Button>
  );
};

/**
 * Bottom-of-sidebar user pill that opens a dropdown with Settings and Logout.
 * In slim mode, collapses to just the user avatar.
 */
const SidebarUserMenu = (props: {
  onSettings: () => void;
  onCommandMenu: () => void;
}) => {
  const userId = useUserId();
  const email = useEmail();
  const logout = useLogout();
  const [displayName] = useDisplayName(tryMacroId(userId() ?? ''));

  const label = () => displayName() || email() || 'Account';

  return (
    <Dropdown placement="bottom-start" gutter={6}>
      <Dropdown.Trigger
        as="button"
        type="button"
        class={cn(
          'flex items-center gap-2.5 w-full min-w-0 px-2 py-1.5 rounded-md ring-1 ring-edge-muted hover:bg-ink/5 data-expanded:bg-ink/5 transition-colors text-left',
          'group-data-[slim=true]/sidebar:px-0 group-data-[slim=true]/sidebar:py-1 group-data-[slim=true]/sidebar:ring-0'
        )}
      >
        <LogoIcon class="size-4 shrink-0 text-accent" />
        <span class="flex-1 min-w-0 text-xs font-medium text-ink truncate group-data-[slim=true]/sidebar:hidden">
          {label()}
        </span>
        <CaretDownIcon class="size-3 shrink-0 text-ink-extra-muted group-data-[slim=true]/sidebar:hidden" />
      </Dropdown.Trigger>
      <Dropdown.Content depth={1} class="min-w-56 shadow-lg">
        <div class="flex flex-col bg-surface p-1">
          <div class="flex items-center gap-2.5 px-2 py-2.5">
            <UserIcon
              id={userId() ?? ''}
              size="lg"
              suppressClick
              showTooltip={false}
            />
            <div class="flex-1 min-w-0 flex flex-col gap-0.5">
              <div class="text-sm font-semibold text-ink truncate leading-tight">
                {displayName() || 'Account'}
              </div>
              <Show when={email()}>
                <div class="text-xs text-ink-muted truncate leading-tight">
                  {email()}
                </div>
              </Show>
            </div>
          </div>
          <div class="mx-2 my-1 h-px bg-edge-muted" />
          <Dropdown.Item
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-ink-muted hover:text-ink hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
            onSelect={props.onCommandMenu}
          >
            <CommandIcon class="size-3.5 shrink-0" />
            <span class="flex-1 truncate">Command menu</span>
            <Hotkey token={TOKENS.global.commandMenu} class="flex gap-0.5 text-ink-extra-muted" />
          </Dropdown.Item>
          <Dropdown.Item
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-ink-muted hover:text-ink hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
            onSelect={props.onSettings}
          >
            <GearIcon class="size-3.5 shrink-0" />
            <span class="flex-1 truncate">Settings</span>
          </Dropdown.Item>
          <Dropdown.Item
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-failure hover:bg-failure-bg focus:bg-failure-bg outline-none cursor-default rounded-sm"
            onSelect={logout}
          >
            <SignOutIcon class="size-3.5 shrink-0" />
            <span class="flex-1 truncate">Log out</span>
          </Dropdown.Item>
        </div>
      </Dropdown.Content>
    </Dropdown>
  );
};

type SidebarSettingsWidgetProps = {
  isSlim: () => boolean;
  onSelect: (tab: SettingsTab) => void;
  isTabAvailable: (tab: SettingsTab) => boolean;
};

const SidebarSettingsWidget = (props: SidebarSettingsWidgetProps) => {
  const userId = useUserId();

  const topItems = createMemo(() =>
    SETTINGS_MENU_TOP_ITEMS.filter((item) => props.isTabAvailable(item.tab))
  );
  const bottomItems = createMemo(() =>
    SETTINGS_MENU_BOTTOM_ITEMS.filter((item) => props.isTabAvailable(item.tab))
  );

  return (
    <Dropdown placement="top-start" gutter={6}>
      <Dropdown.Trigger
        variant="ghost"
        class={cn(
          'flex items-center w-full rounded-md cursor-default text-ink-extra-muted not-disabled:hover:bg-ink/3 h-9',
          'justify-start gap-2 px-1.5 py-1',
          'group-data-[slim=true]/sidebar:justify-center group-data-[slim=true]/sidebar:gap-0'
        )}
        label={props.isSlim() ? 'Settings' : undefined}
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
            <div class="size-5">
              <UserIcon
                id={id()}
                size="fill"
                suppressClick
                showTooltip={false}
                // class="-m-1"
              />
            </div>
          )}
        </Show>
        <span class="flex-1 min-w-0 text-left whitespace-nowrap text-sm truncate group-data-[slim=true]/sidebar:hidden">
          Settings
        </span>
        <CaretUpIcon class="size-3 text-ink-extra-muted shrink-0 group-data-[slim=true]/sidebar:hidden" />
      </Dropdown.Trigger>
      <Dropdown.Content>
        <Dropdown.Group>
          <For each={topItems()}>
            {(item) => (
              <Dropdown.Item
                class="flex items-center gap-2 px-2.5 py-2 text-sm cursor-default outline-none text-ink-muted"
                onSelect={() => props.onSelect(item.tab)}
              >
                <span class="size-5 flex items-center justify-center">
                  <Dynamic
                    component={item.icon}
                    class="size-4 shrink-0 text-ink-extra-muted"
                  />
                </span>
                <span class="text-ink">{item.label}</span>
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
        <Dropdown.Group>
          <For each={bottomItems()}>
            {(item) => (
              <Dropdown.Item
                class="flex items-center gap-2 px-2.5 py-2 text-sm cursor-default outline-none text-ink-muted"
                onSelect={() => props.onSelect(item.tab)}
              >
                <span class="size-5 flex items-center justify-center">
                  <Dynamic
                    component={item.icon}
                    class="size-4 shrink-0 text-ink-extra-muted"
                  />
                </span>
                <span class="text-ink">{item.label}</span>
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
};

const CALLS_LINK: SidebarItem = {
  id: 'calls',
  label: 'Calls',
  href: LIST_VIEW_PATHS.calls,
  icon: AnimatedCallIcon,
  hotkey: 'l',
  hotkeyToken: TOKENS.sidebar.goTo.calls,
};

export const AppSidebar = (props: AppSidebarProps) => {
  const analytics = useAnalytics();
  const layout = useSplitLayout();
  const { openSettings, setActiveTabId, settingsOpen } = useSettingsState();
  const isTabAvailable = useIsSettingsTabAvailable();
  const notificationSettings = useNotificationSettings();
  const callCtx = useCallContextOptional();

  const hasPaidAccess = useHasPaidAccess();

  /** Persisted dismissal for the Premium upgrade promo card. */
  const [premiumCardDismissed, setPremiumCardDismissed] = makePersisted(
    createSignal<boolean>(false),
    { name: 'sidebar-premium-card-dismissed' }
  );

  const newPricingFF = useFeatureFlag('enable-new-pricing', {
    enabledOverride: ENABLE_NEW_PRICING_OVERRIDE,
  });

  const showEnableNotifications = () =>
    notificationSettings.isSupported && notificationSettings.canPrompt();

  const handleEnableNotifications = async () => {
    if (!notificationSettings.isSupported) return;
    try {
      await notificationSettings.toggle(true);
    } catch (error) {
      console.error('Failed to enable notifications:', error);
    }
  };

  const [hotkeyVisible, setHotkeyVisible] = createSignal(false);

  const visibleLinks = createMemo(() => {
    if (!ENABLE_CALLS()) return SIDEBAR_LINKS;
    const idx = SIDEBAR_LINKS.findIndex((l) => l.id === 'channels');
    return [
      ...SIDEBAR_LINKS.slice(0, idx + 1),
      CALLS_LINK,
      ...SIDEBAR_LINKS.slice(idx + 1),
    ];
  });

  const resetHotkeysState = () => {
    setHotkeyVisible(false);

    // To prevent the next key from triggering the hotkey handler,
    // we reset the pressed keys state and exit the command scope
    clearPressedKeys();
    activateClosestDOMScope();
  };

  const handleCommandPaletteClick = () => {
    if (!CommandState.isOpen()) {
      analytics.track('command_menu_open', { from: 'sidebar' });
    }
    CommandState.toggle();
  };

  const handleCreateClick = () => {
    const willOpen = !createMenuOpen();
    if (willOpen) {
      analytics.track('create_menu_open', { from: 'sidebar' });
    }
    setCreateMenuOpen((p) => !p);
  };

  const openSettingsTab = (tab: SettingsTab) => {
    if (!isTabAvailable(tab)) return;
    if (settingsOpen()) {
      setActiveTabId(tab);
      return;
    }
    analytics.track('split_created', { from: 'sidebar' });
    openSettings(tab);
  };

  const isExpanded = () => props.sidebarState === 'expanded';
  const isSlim = () => props.sidebarState === 'slim';

  let sidebarShell: HTMLDivElement | undefined;
  const { panelIsSlim, handleSidebarOpenChange } = createInCallPanelSlimToggle({
    initialSlim: isSlim(),
    parentOnOpenChange: props.onOpenChange,
    getShell: () => sidebarShell,
  });

  registerSidebarHotkeys({
    links: visibleLinks(),
    hotkeyVisible,
    setHotkeyVisible,
    resetHotkeysState,
    isSlim,
    onOpenChange: handleSidebarOpenChange,
    openWithSplit: layout.openWithSplit,
  });

  return (
    <div
      ref={(el) => {
        sidebarShell = el ?? undefined;
      }}
      class={cn(
        'group/sidebar h-full py-2 flex flex-col gap-0 mobile:absolute mobile:z-modal-content overflow-hidden',
        isExpanded() &&
          'max-w-52 w-full mobile:max-w-2/3 translate-x-0 opacity-100',
        props.sidebarState === 'hidden' &&
          '-translate-x-full overflow-hidden opacity-0',

        isSlim() && 'max-w-12 w-full mobile:max-w-2/3 translate-x-0 opacity-100'
      )}
      data-expanded={isExpanded()}
      data-slim={isSlim()}
      style={{ transition: SIDEBAR_MAX_WIDTH_TRANSITION_STYLE }}
    >
      <div class="flex items-center justify-between gap-1.5 group-data-[slim=true]/sidebar:gap-0 p-2 relative group-data-[slim=true]/sidebar:pr-2.25">
        <div class="min-w-0 group-data-[slim=true]/sidebar:max-w-0 group-data-[slim=true]/sidebar:overflow-hidden">
          <SidebarUserMenu
            onSettings={() => openSettingsTab('Account')}
            onCommandMenu={handleCommandPaletteClick}
          />
        </div>
        <div class="flex items-center gap-0.5 shrink-0 ml-auto">
          <div class="flex items-center gap-0.5 group-data-[slim=true]/sidebar:hidden">
            <Show when={showEnableNotifications()}>
              <SidebarIconButton
                label="Enable Notifications"
                onClick={handleEnableNotifications}
                icon={(p) => <BellIcon class={p.class} />}
                isSlim={isSlim}
              />
            </Show>
          </div>
          <Button
            class="size-7 rounded-md p-1 [&_svg]:size-4"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
            }}
            onClick={() => {
              handleSidebarOpenChange(!isExpanded());
              globalSplitManager()?.returnFocus();
            }}
            label={isExpanded() ? 'Shrink Sidebar' : 'Expand Sidebar'}
            hotkey={TOKENS.global.toggleSidebar}
          >
            <SquareSidebarIcon />
          </Button>
        </div>
      </div>

      <div class="w-full px-2 mt-4 mb-2">
        <SidebarCreateButton
          label="Create"
          hotkeyToken={TOKENS.global.createCommand}
          isSlim={isSlim}
          onClick={handleCreateClick}
          icon={() => <PlusIcon />}
        />
      </div>

      <nav>
        <ul class="size-full px-2 flex flex-col gap-0.5">
          <For each={visibleLinks()}>
            {(link) => (
              <li>
                <SidebarLink
                  {...link}
                  sidebarState={props.sidebarState ?? 'expanded'}
                  hotkeyVisible={hotkeyVisible()}
                />
              </li>
            )}
          </For>
        </ul>
      </nav>

      <div class="block max-h-[clamp(10%,60%,20rem)] mt-2">
        <ChannelsUnreadWidget sidebarState={props.sidebarState ?? 'expanded'} />
      </div>

      <Show when={callCtx?.isInCall()}>
        <div class="px-2 mb-2 mt-auto" data-ui="in-call-panel">
          <InCallPanel isSlim={panelIsSlim} />
        </div>
      </Show>

      {/* MERGE NOTE: kept HEAD's redesigned footer (notifications/invite/mobile
          cards using the local SidebarPromoCard API with isSlim+icon). Dropped
          main's Premium-upgrade card + shortcut-link block, which relied on the
          extracted sidebar-promo.tsx API that lacks isSlim/icon. premiumHintVisible
          / setPremiumCardDismissed remain defined if that card is reintroduced. */}
      <div
        class={cn(
          'w-full px-2 flex flex-col gap-2',
          !callCtx?.isInCall() && 'mt-auto'
        )}
      >
        <Show
          when={showEnableNotifications() && !notificationsCardDismissed()}
        >
          <SidebarPromoCard
            label="Enable notifications"
            description="Stay in the loop when you're away"
            isSlim={isSlim}
            onDismiss={() => {
              setNotificationsCardDismissed(true);
              setNotificationsHintVisible(true);
            }}
            icon={() => <BellIcon class="size-4" />}
            primaryAction={{
              label: 'Turn on',
              onClick: handleEnableNotifications,
            }}
            secondaryAction={{
              label: 'Later',
              onClick: () => {
                setNotificationsCardDismissed(true);
                setNotificationsHintVisible(true);
              },
            }}
          />
        </Show>
        <Show when={notificationsHintVisible() && notificationsCardDismissed()}>
          <SidebarPromoHint
            isSlim={isSlim}
            title="Notifications"
            message="You can turn notifications back on anytime from Settings."
            onDone={() => setNotificationsHintVisible(false)}
          />
        </Show>
        <Show when={!inviteCardDismissed()}>
          <SidebarPromoCard
            label="Invite teammates"
            description="Get $100 in credits for each friend who signs up"
            isSlim={isSlim}
            onDismiss={() => {
              setInviteCardDismissed(true);
              setInviteHintVisible(true);
            }}
            icon={AnimatedUsersIcon}
            primaryAction={{
              label: 'Invite',
              onClick: () => setInviteModalOpen(true),
            }}
            secondaryAction={{
              label: 'Later',
              onClick: () => {
                setInviteCardDismissed(true);
                setInviteHintVisible(true);
              },
            }}
          />
        </Show>
        <Show when={inviteHintVisible() && inviteCardDismissed()}>
          <SidebarPromoHint
            isSlim={isSlim}
            title="Invite teammates"
            message="You can invite teammates anytime from the user menu below."
            onDone={() => setInviteHintVisible(false)}
          />
        </Show>
        <Show when={!mobileAppCardDismissed()}>
          <SidebarMobileAppCard
            isSlim={isSlim}
            onDismiss={() => setMobileAppCardDismissed(true)}
          />
        </Show>
      </div>
      <InviteModal />
    </div>
  );
};

interface SidebarLinkProps extends SidebarItem {
  sidebarState: SidebarState;
  hotkeyVisible: boolean;
}

const SidebarLink = (props: SidebarLinkProps) => {
  const [isHovering, setIsHovering] = createSignal(false);

  const analytics = useAnalytics();
  const layout = useSplitLayout();
  const layoutManager = globalSplitManager();

  const location = useLocation();

  const isActive = () => {
    const activeContent = layoutManager?.activeSplit()?.content();

    // In case we can't match on the active split, use the url path to determine
    // if this link is active
    if (!activeContent) {
      const paths = location.pathname.split('/').filter(Boolean);
      return paths.includes(props.id);
    }

    return activeContent?.id === props.id;
  };

  const content = () =>
    ({
      type: 'component',
      id: props.id,
    }) as const;

  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? true;

  const openInCurrentSplit = () =>
    layout.openWithSplit(content(), {
      allowDuplicate: true,
      mergeHistory: false,
      referredFrom: 'sidebar',
    });

  const openInNewSplit = () => {
    const manager = globalSplitManager();
    if (!manager || !manager.canAppendSplit()) return;

    analytics.track('split_created', { from: 'sidebar' });

    manager.createNewSplit({
      content: content(),
      activate: true,
      allowDuplicate: true,
      referredFrom: 'sidebar',
    });
  };

  const openFullscreen = () => {
    const split = openInCurrentSplit();
    split?.toggleSpotlight(true);
  };

  return (
    <ContextMenu>
      <ContextMenu.Trigger class="w-full">
        <Button
          draggable={false}
          variant="ghost"
          data-sidebar-link={props.id}
          data-active={isActive() ? '' : undefined}
          class={cn(
            'flex items-center justify-start group-data-[slim=true]/sidebar:justify-center text-xs gap-2 cursor-default w-full rounded-md py-1.5 text-ink-muted not-disabled:hover:text-ink [&_svg]:size-4',
            isActive() &&
              'bg-ink/10 not-disabled:hover:bg-ink/15 text-ink not-disabled:hover:text-ink shadow-sm'
          )}
          tooltipPlacement="right"
          onMouseEnter={() => setIsHovering(true)}
          label={
            props.sidebarState === 'slim' ? `Go to ${props.label}` : undefined
          }
          hotkey={
            props.sidebarState === 'slim'
              ? props.standaloneHotkey
                ? props.hotkeyToken
                : [TOKENS.sidebar.goToLeader, props.hotkeyToken]
              : undefined
          }
          onMouseLeave={() => setIsHovering(false)}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            analytics.track('sidebar_click', {
              view: props.id,
            });

            e.preventDefault();
            let currentContentHandle = layoutManager?.activeSplit();

            const currentContent = currentContentHandle?.content();
            const isSameContent =
              currentContent?.type === 'component' &&
              currentContent?.id === props.id;

            if (!isSameContent || e.shiftKey) {
              currentContentHandle = navigateToSidebarView({
                viewId: props.id,
                shiftKey: e.shiftKey,
                activeSplit: currentContentHandle,
                openWithSplit: layout.openWithSplit,
                referredFrom: 'sidebar',
              });
            }

            if (props.id === 'search' && currentContentHandle) {
              requestSearchFocus(currentContentHandle.id);
            }

            layoutManager?.returnFocus();
          }}
        >
          <Show when={props.icon}>
            <div class="shrink-0 [&_svg]:size-4">
              <Dynamic component={props.icon} triggerAnimation={isHovering()} />
            </div>
          </Show>

          <div class="flex items-center gap-1 group-data-[slim=true]/sidebar:hidden">
            <span class="whitespace-nowrap">{props.label}</span>
          </div>

          <Show when={isHovering() && !props.hotkeyVisible}>
            <div class="group-data-[slim=true]/sidebar:hidden ml-auto">
              <div class="flex gap-1 items-center text-ink-extra-muted font-normal text-xxs">
                <Show when={!props.standaloneHotkey}>
                  <div class="text-xxs text-ink-extra-muted rounded-sm ml-auto border border-ink/5 px-1.5 py-0.5 -my-1">
                    <Hotkey token={TOKENS.sidebar.goToLeader} />
                  </div>
                  <div class="text-xxs text-ink-extra-muted rounded-sm ml-auto border border-ink/5 px-1.5 py-0.5 -my-1">
                    <Hotkey token={props.hotkeyToken} />
                  </div>
                </Show>
                <Show when={props.standaloneHotkey}>
                  <div class="text-xxs text-ink-extra-muted rounded-sm ml-auto border border-ink/5 px-1.5 py-0.5 -my-1">
                    <Hotkey token={props.hotkeyToken} />
                  </div>
                </Show>
              </div>
            </div>
          </Show>
          <Show when={props.hotkeyVisible}>
            <div
              class={cn(
                'text-xs size-4 rounded-xs flex items-center justify-center overflow-hidden bg-accent/10 border border-accent/30 text-accent',
                props.sidebarState === 'slim' && 'absolute -bottom-1 -right-1',
                props.sidebarState !== 'slim' && 'relative p-1 ml-auto'
              )}
            >
              <Hotkey token={props.hotkeyToken} />
            </div>
          </Show>
        </Button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenuContent class="text-xs text-ink-muted">
          <MenuItem
            text="Open in new split"
            onClick={openInNewSplit}
            disabled={!canOpenInNewSplit()}
          />
          <MenuItem text="Open fullscreen" onClick={openFullscreen} />
          <MenuItem text="Open in current split" onClick={openInCurrentSplit} />
        </ContextMenuContent>
      </ContextMenu.Portal>
    </ContextMenu>
  );
};
