import { GO_TO_COMMAND_SCOPE, GO_TO_LEADER_KEY } from '@app/constants/hotkeys';
import {
  isListViewID,
  LIST_VIEW_PATHS,
  type ListView,
} from '@app/constants/list-views';
import { SidebarCreateMenu } from '@app/features/command/sidebar/sidebar-create-menu';
import { useGettingStartedEnabled } from '@app/features/getting-started/account-gate';
import { buildDocumentTypeQuery } from '@app/features/next-soup/filters/configs/document-type-query';
import { getDocumentsFilterSplit } from '@app/features/next-soup/soup-view/documents-filter-controllers';
import { requestSearchFocus } from '@app/features/next-soup/soup-view/search-controllers';
import { requestViewSwitcherOpen } from '@app/features/next-soup/soup-view/view-switcher-controllers';
import {
  InviteModal,
  setInviteModalOpen,
} from '@app/features/team-invitations/invite-modal';
import { useHotkeyInterceptor } from '@app/signal/hotkeyRoot';
import { globalSplitManager } from '@app/signal/splitLayout';
import { useSplitLayout } from '@components/app/split-layout/layout';
import type {
  ReferredFrom,
  SplitHandle,
} from '@components/app/split-layout/layoutManager';
import {
  ENABLE_ACTIVITY,
  ENABLE_CALLS,
  ENABLE_CRM,
} from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { clearPressedKeys } from '@core/hotkey/state';
import { type HotkeyToken, TOKENS } from '@core/hotkey/tokens';
import type { ValidHotkey } from '@core/hotkey/types';
import { activateClosestDOMScope } from '@core/hotkey/utils';
import { AnimatedActivityIcon } from '@icon/wide-activity';
import { AnimatedCallIcon } from '@icon/wide-call';
import { AnimatedChannelIcon } from '@icon/wide-channel';
import { AnimatedCompanyIcon } from '@icon/wide-company';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedInboxIcon } from '@icon/wide-inbox';
import { AnimatedSearchIcon } from '@icon/wide-search';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import CompassIcon from '@phosphor/compass.svg';
import HomeIcon from '@phosphor/house.svg';
import { debounce } from '@solid-primitives/scheduled';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  onCleanup,
} from 'solid-js';

export interface SidebarItem {
  id: ListView | (string & {});
  label: string;
  href: string;
  params?: Record<string, unknown>;
  icon?: Component<
    JSX.SvgSVGAttributes<SVGSVGElement> | { triggerAnimation?: boolean }
  >;
  hotkey: ValidHotkey;
  hotkeyToken: HotkeyToken;
  standaloneHotkey?: boolean;
  hiddenFromSidebar?: boolean;
}

/**
 * Legacy tri-state of the removed app sidebar. Still the prop shape of a few
 * components (favorites section, call widgets, unread widget) that render in
 * both docked and floating contexts.
 */
export type SidebarState = 'hidden' | 'expanded' | 'slim';

const markdownDocumentsQuery = buildDocumentTypeQuery(['doc-markdown']);

const SIDEBAR_LINKS = [
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
    hiddenFromSidebar: true,
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
    label: 'Files',
    href: LIST_VIEW_PATHS.documents,
    icon: AnimatedFileMdIcon,
    hotkey: 'f',
    hotkeyToken: TOKENS.sidebar.goTo.documents,
  },
  {
    id: 'documents',
    label: 'Documents',
    href: LIST_VIEW_PATHS.documents,
    params: {
      initialFilters: markdownDocumentsQuery ?? {},
      initialClientFilters: {
        and: ['document-or-file'],
        or: ['doc-markdown'],
      },
    },
    icon: AnimatedFileMdIcon,
    hotkey: 'd',
    hotkeyToken: TOKENS.sidebar.goTo.markdownDocuments,
    hiddenFromSidebar: true,
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
] satisfies SidebarItem[];

type OpenWithSplitFn = ReturnType<typeof useSplitLayout>['openWithSplit'];

const isMarkdownDocumentsParams = (
  params: SidebarItem['params'] | undefined
): boolean => {
  const initialClientFilters = params?.initialClientFilters as
    | { or?: readonly unknown[] }
    | undefined;

  return initialClientFilters?.or?.includes('doc-markdown') ?? false;
};

/**
 * Navigate to a nav view by pushing a fresh entry into the active split.
 * Holding shift opens it in a new split. Use in-app back/forward to return to
 * prior entries.
 */
export function navigateToSidebarView(args: {
  viewId: SidebarItem['id'];
  params?: SidebarItem['params'];
  shiftKey: boolean;
  activeSplit: SplitHandle | undefined;
  openWithSplit: OpenWithSplitFn;
  referredFrom?: ReferredFrom;
}): SplitHandle | undefined {
  const { viewId, params, shiftKey, activeSplit, openWithSplit, referredFrom } =
    args;

  const activeContent = activeSplit?.content();
  if (
    !shiftKey &&
    isMarkdownDocumentsParams(params) &&
    activeContent?.type === 'component' &&
    activeContent.id === 'documents'
  ) {
    const controller = activeSplit
      ? getDocumentsFilterSplit(activeSplit.id)
      : undefined;
    if (controller) {
      controller.toggleMarkdownFilter();
      return activeSplit;
    }
  }

  return openWithSplit(
    { type: 'component', id: viewId, params },
    {
      preferNewSplit: shiftKey,
      mergeHistory: false,
      allowDuplicate: true,
      referredFrom,
    }
  );
}

/**
 * Whether the "g" leader key is currently awaiting a destination key.
 */
const [goToHotkeyVisible, setGoToHotkeyVisible] = createSignal(false);

const resetGoToHotkeysState = () => {
  setGoToHotkeyVisible(false);
  // To prevent the next key from triggering the hotkey handler,
  // we reset the pressed keys state and exit the command scope
  clearPressedKeys();
  activateClosestDOMScope();
};

/** The `g v` destination key that pops the active list panel's view switcher. */
const VIEW_SWITCHER_HOTKEY: ValidHotkey = 'v';

const CALLS_LINK: SidebarItem = {
  id: 'calls',
  label: 'Calls',
  href: LIST_VIEW_PATHS.calls,
  icon: AnimatedCallIcon,
  hotkey: 'l',
  hotkeyToken: TOKENS.sidebar.goTo.calls,
};

const COMPANIES_LINK: SidebarItem = {
  id: 'companies',
  label: 'Customers',
  href: LIST_VIEW_PATHS.companies,
  icon: AnimatedCompanyIcon,
  hotkey: 'o',
  hotkeyToken: TOKENS.sidebar.goTo.companies,
};

const DASHBOARD_LINK: SidebarItem = {
  id: 'home',
  label: 'Home',
  href: '/home',
  icon: HomeIcon,
  hotkey: 'h',
  hotkeyToken: TOKENS.sidebar.goTo.home,
};

const GETTING_STARTED_LINK: SidebarItem = {
  id: 'getting-started',
  label: 'Getting Started',
  href: '/getting-started',
  icon: CompassIcon,
  hotkey: 's',
  hotkeyToken: TOKENS.sidebar.goTo.gettingStarted,
};

const ACTIVITY_LINK: SidebarItem = {
  id: 'activity',
  label: 'Activity',
  href: '/activity',
  icon: AnimatedActivityIcon,
  hotkey: 'y',
  hotkeyToken: TOKENS.sidebar.goTo.activity,
};

/**
 * Assemble the ordered nav link list: the static links plus Home, Getting
 * started, and the flag-gated Activity, Calls, and CRM entries in their
 * correct positions.
 * Shared by the always-mounted `GoToHotkeys` registrar and the list panel's
 * view switcher so their link sets can't drift. Call from a reactive context —
 * it reads `ENABLE_CALLS()` / `ENABLE_CRM()`.
 * `showGettingStarted` is the account-age gate (`useGettingStartedEnabled`),
 * passed in because this runs outside a component; when false the link is
 * fully absent — `g s` hotkey and command menu entry included.
 * The view switcher additionally drops `hiddenFromSidebar` entries, which
 * have hotkeys but no menu row.
 */
export const buildSidebarLinks = (
  showGettingStarted: boolean
): SidebarItem[] => {
  let links: SidebarItem[] = [
    DASHBOARD_LINK,
    ...(showGettingStarted ? [GETTING_STARTED_LINK] : []),
    ...SIDEBAR_LINKS,
  ];

  if (ENABLE_ACTIVITY) {
    const idx = links.findIndex((link) => link.id === 'inbox');
    links = [
      ...links.slice(0, idx + 1),
      ACTIVITY_LINK,
      ...links.slice(idx + 1),
    ];
  }

  if (ENABLE_CALLS()) {
    const idx = links.findIndex((l) => l.id === 'channels');
    links = [...links.slice(0, idx + 1), CALLS_LINK, ...links.slice(idx + 1)];
  }

  if (ENABLE_CRM()) {
    // Customers sits just after Channels (and Calls when present).
    const anchorId = ENABLE_CALLS() ? 'calls' : 'channels';
    const idx = links.findIndex((l) => l.id === anchorId);
    links = [
      ...links.slice(0, idx + 1),
      COMPANIES_LINK,
      ...links.slice(idx + 1),
    ];
  }

  return links;
};

/**
 * Hosts the always-on global shortcuts that must keep working even on
 * full-cover routes like solo settings: the "g" leader key with its per-link
 * "go to" nav hotkeys (e.g. "g i" for inbox), "g v" for the view switcher,
 * plus Send Invites. Rendered unconditionally from `Layout`, and — now that
 * the app sidebar is gone — also hosts the invite modal it triggers.
 */
export const GoToHotkeys = () => {
  const { openWithSplit } = useSplitLayout();

  const inviteHotkey = registerHotkey({
    scopeId: 'global',
    hotkeyToken: TOKENS.global.inviteTeam,
    description: 'Send Invites',
    keyDownHandler: (e) => {
      e?.preventDefault();
      setInviteModalOpen(true);
      return true;
    },
  });

  const gettingStartedEnabled = useGettingStartedEnabled();
  const links = createMemo((): SidebarItem[] =>
    buildSidebarLinks(gettingStartedEnabled())
  );

  const debounceResetHotkeysState = debounce(resetGoToHotkeysState, 2000);
  const debounceSetHotkeyVisible = debounce(
    () => setGoToHotkeyVisible(true),
    200
  );

  // Register 'g' as a leader key that activates the global GO_TO command scope
  const leaderHotkey = registerHotkey({
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

  // Opens the view switcher dropdown in the active list panel. From a
  // preview Viewer the request targets its Controller (that's where the list
  // lives); from a non-list split it first lands on the inbox, opening the
  // switcher once it registers.
  const viewSwitcherHotkey = registerHotkey({
    hotkey: VIEW_SWITCHER_HOTKEY,
    scopeId: GO_TO_COMMAND_SCOPE,
    hotkeyToken: TOKENS.sidebar.viewSwitcher,
    description: 'Switch view',
    keyDownHandler: (e) => {
      e?.preventDefault();
      if (goToHotkeyVisible()) {
        resetGoToHotkeysState();
        debounceResetHotkeysState.clear();
      }

      const manager = globalSplitManager();
      let split = manager?.activeSplit();
      const controllerId = split ? manager?.controllerOf(split.id) : undefined;
      if (controllerId !== undefined) split = manager?.getSplit(controllerId);

      // The Search view is the one list view without a switcher, so it takes
      // the navigate-to-inbox path below instead of queueing an open that
      // would never drain.
      const contentId = split?.content().id;
      if (split && isListViewID(contentId) && contentId !== 'search') {
        requestViewSwitcherOpen(split.id);
        return true;
      }

      const handle = navigateToSidebarView({
        viewId: 'inbox',
        shiftKey: false,
        activeSplit: split,
        openWithSplit,
      });
      if (handle) requestViewSwitcherOpen(handle.id);
      return true;
    },
  });

  // These register in the 'global' scope (or the long-lived GO_TO command
  // scope), which outlives this component, so dispose them on unmount.
  // Otherwise a remount (e.g. crossing the mobile breakpoint) leaks: the
  // 'add' leader stacks duplicate handlers and the token-only commands
  // accumulate in the registry. The per-link nav hotkeys below are disposed
  // by their own effect cleanup.
  onCleanup(() => {
    inviteHotkey.dispose();
    leaderHotkey.dispose();
    viewSwitcherHotkey.dispose();
  });

  const registeredGoToKeys = () =>
    new Set<ValidHotkey>([
      ...links().map((link) => link.hotkey),
      VIEW_SWITCHER_HOTKEY,
    ]);

  // When the go to command scope is active, we want to prevent
  // other default hotkeys from running. So doing "g" + some key
  // not part of the nav hotkeys, won't fire the command
  // for the key
  useHotkeyInterceptor((context) => {
    // If a hotkey is going to be fired, but the hotkeys are not
    // visible, then it's not a nav hotkey and we can
    // ignore it and reset our visible state
    if (!goToHotkeyVisible()) {
      debounceSetHotkeyVisible.clear();
      return false;
    }

    if (context.eventType !== 'keydown') return false;

    if (
      context.activeScopeId !== GO_TO_COMMAND_SCOPE ||
      registeredGoToKeys().has(context.pressedKeysString)
    ) {
      return false;
    }

    resetGoToHotkeysState();
    debounceResetHotkeysState.clear();

    return true;
  });

  // Register navigation shortcuts in the global GO_TO command scope.
  // This must be reactive because prod feature flags can add links after the
  // initial render (e.g. Home), and Hotkey UI resolves tokens from the registry.
  createEffect(() => {
    const disposers = links().map((link) => {
      const openSidebarView = (e?: KeyboardEvent) => {
        e?.preventDefault();
        if (goToHotkeyVisible()) {
          resetGoToHotkeysState();
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
          params: link.params,
          shiftKey: !!e?.shiftKey,
          activeSplit: globalSplitManager()?.activeSplit(),
          openWithSplit,
        });
        if (link.id === 'search' && handle) {
          requestSearchFocus(handle.id);
        }
        return true;
      };

      return registerHotkey({
        hotkey: link.hotkey,
        scopeId: link.standaloneHotkey ? 'global' : GO_TO_COMMAND_SCOPE,
        hotkeyToken: link.hotkeyToken,
        description: `Go to ${link.label}`,
        keyDownHandler: openSidebarView,
        icon: link.icon,
      });
    });

    onCleanup(() => {
      for (const disposer of disposers) {
        disposer.dispose();
      }
    });
  });

  return <InviteModal />;
};

/**
 * The global create menu, re-exported for the list panel header so consumers
 * don't reach into the command feature directly.
 */
export const GlobalCreateButton = () => (
  <SidebarCreateMenu
    isSlim={() => false}
    variant="icon"
    placement="bottom-end"
  />
);
