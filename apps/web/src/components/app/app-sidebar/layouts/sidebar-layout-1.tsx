/**
 * EXPERIMENT: Sidebar layout 1.
 *
 * A self-contained copy of `../sidebar.tsx` (duplication is intentional so
 * layouts can be swapped/deleted freely while experimenting). Differences from
 * the original:
 * - The "Conversations" and "Workspace" collapsible sections are replaced by
 *   a single flat list of links, spaced away from the top Home/Inbox/Activity
 *   block.
 * - The Calls link is removed.
 * - A horizontal icon-only tab bar sits below the top links with three tabs:
 *   Views (the default sidebar content), Channels (a list of your channels),
 *   and Agents (a list of agent chats). Switching tabs swaps the sidebar body.
 *
 * To activate, import `AppSidebar` from this file in `Layout.tsx` instead of
 * `@components/app/app-sidebar/sidebar`. `GoToHotkeys` stays in the original
 * module and keeps being imported from there.
 */
import { LIST_VIEW_PATHS, type ListView } from '@app/constants/list-views';
import { SidebarActiveCallWidget } from '@app/features/block-call/sidebar/active-call-widget';
import { ChannelsRecentWidget } from '@app/features/channel/sidebar/channels-recent-widget';
import { CommandState } from '@app/features/command';
import { SidebarCreateMenu } from '@app/features/command/sidebar/sidebar-create-menu';
import { FavoritesSection } from '@app/features/favorites/sidebar/favorites-section';
import { useGettingStartedEnabled } from '@app/features/getting-started/account-gate';
import { createGettingStartedSidebarVisibility } from '@app/features/getting-started/sidebar-visibility';
import { buildDocumentTypeQuery } from '@app/features/next-soup/filters/configs/document-type-query';
import { QUERY_FILTERS_BASE } from '@app/features/next-soup/filters/query-filters';
import { getDocumentsFilterSplit } from '@app/features/next-soup/soup-view/documents-filter-controllers';
import {
  getInboxFilterSplit,
  INBOX_FILTER_ENTRY_KEY,
  requestInboxFilter,
} from '@app/features/next-soup/soup-view/inbox-filter-controllers';
import { requestSearchFocus } from '@app/features/next-soup/soup-view/search-controllers';
import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import {
  InviteModal,
  setInviteModalOpen,
} from '@app/features/team-invitations/invite-modal';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { globalSplitManager } from '@app/signal/splitLayout';
import { useCallContextOptional } from '@channel/Call/CallContext';
import { InCallPanel } from '@channel/Call/InCallPanel';
import { openNewChannelModal } from '@channel/CreateChannelModal';
import {
  CollapsibleSidebarSection,
  type CollapsibleSidebarSectionItem,
} from '@components/app/app-sidebar/collapsible-sidebar-section';
import {
  SidebarPromoCard,
  SidebarPromoHint,
} from '@components/app/app-sidebar/sidebar-promo';
import { useSplitLayout } from '@components/app/split-layout/layout';
import type {
  ReferredFrom,
  SplitContent,
  SplitHandle,
} from '@components/app/split-layout/layoutManager';
import { useHasPaidAccess } from '@core/auth';
import { useLogout } from '@core/auth/logout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import {
  EntityIcon,
  type EntityIconSelector,
} from '@core/component/EntityIcon';
import { inboxIconProps } from '@core/component/inboxIcon';
import { StaticMarkdown } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { unifiedListMarkdownTheme } from '@core/component/LexicalMarkdown/theme';
import { toast } from '@core/component/Toast/Toast';
import { UserIcon } from '@core/component/UserIcon';
import {
  ENABLE_ACTIVITY,
  ENABLE_CRM,
  ENABLE_NEW_PRICING_OVERRIDE,
} from '@core/constant/featureFlags';
import {
  type SettingsTab,
  useSettingsState,
} from '@core/constant/SettingsState';
import {
  getSettingsTabItem,
  useSettingsTabAvailable,
} from '@core/constant/settingsTabsConfig';
import { useEmail, useUserId } from '@core/context/user';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { type HotkeyToken, TOKENS } from '@core/hotkey/tokens';
import type { ValidHotkey } from '@core/hotkey/types';
import { tryMacroId, useDisplayName } from '@core/user';
import type { DateValue } from '@core/util/date';
import {
  type ChannelEntity,
  type ChatEntity,
  type EntityData,
  isChannelEntity,
  isChatEntity,
} from '@entity';
import { DisplayName } from '@entity/components/DisplayName';
import { formatTimestamp } from '@entity/utils/timestamp';
import LogoIcon from '@icon/macro-logo.svg';
import { AnimatedActivityIcon } from '@icon/wide-activity';
import { AnimatedChannelIcon } from '@icon/wide-channel';
import { AnimatedCompanyIcon } from '@icon/wide-company';
import { AnimatedEmailIcon } from '@icon/wide-email';
import { AnimatedFileMdIcon } from '@icon/wide-fileMd';
import { AnimatedInboxIcon } from '@icon/wide-inbox';
import { AnimatedSearchIcon } from '@icon/wide-search';
import { AnimatedStarIcon } from '@icon/wide-star';
import { AnimatedTaskIcon } from '@icon/wide-task';
import { ContextMenu } from '@kobalte/core/context-menu';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CaretUpIcon from '@phosphor/caret-up.svg';
import CompassIcon from '@phosphor/compass.svg';
import DotsThreeIcon from '@phosphor/dots-three.svg';
import FolderIcon from '@phosphor/folder.svg';
import GearIcon from '@phosphor/gear.svg';
import HashIcon from '@phosphor/hash.svg';
import HomeIcon from '@phosphor/house.svg';
import LightbulbIcon from '@phosphor/lightbulb.svg';
import MagnifyingGlassIcon from '@phosphor/magnifying-glass.svg';
import PlusIcon from '@phosphor-icons/core/assets/bold/plus-bold.svg';
import SignOutIcon from '@phosphor/sign-out.svg';
import SquaresFourIcon from '@phosphor/squares-four.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import XIcon from '@phosphor/x.svg';
import { isRealNamePart, useOwnUserName } from '@queries/auth/user-name-self';
import { useEmailLinksQuery } from '@queries/email/link';
import { useSoupItemsQuery } from '@queries/soup/items';
import {
  useJoinTeamMutation,
  useRejectInvitationMutation,
  useUserInvitesQuery,
} from '@queries/team/invitations';
import { useCurrentTeamQuery } from '@queries/team/teams';
import type { TeamInviteDetails } from '@service-auth/generated/schemas/teamInviteDetails';
import { createElementSize } from '@solid-primitives/resize-observer';
import { makePersisted } from '@solid-primitives/storage';
import { useLocation } from '@solidjs/router';
import { Button, cn, Dropdown, Hotkey, NavRow, Tooltip } from '@ui';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  Show,
  Suspense,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { goToHotkeyVisible, type SidebarState } from '../sidebar';

interface SidebarItem {
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

type TryItemId = 'connect' | 'invite' | 'mobile';

type TryItemVisibility = Record<TryItemId, boolean>;

/**
 * The single flat list of main links — the old Conversations + Workspace
 * sections merged, with Calls removed. Agents and Channels are omitted here
 * since they have their own tabs; Files lives in the top links under
 * Activity.
 */
const MAIN_LINK_IDS = ['mail', 'tasks', 'companies'] as const;

/** Icon-only tabs rendered below the top Home/Inbox/Activity links. */
type SidebarTab = 'views' | 'channels' | 'agents';

const DEFAULT_TRY_VISIBILITY: TryItemVisibility = {
  connect: true,
  invite: true,
  mobile: true,
};

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
    icon: FolderIcon,
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

/** Root sidebar `max-width` transition (see `SIDEBAR_MAX_WIDTH_TRANSITION_STYLE`). */
const SIDEBAR_MAX_WIDTH_TRANSITION_MS = 120;
const SIDEBAR_MAX_WIDTH_TRANSITION_STYLE = [
  `max-width ease-in-out ${SIDEBAR_MAX_WIDTH_TRANSITION_MS}ms`,
  `width ease-in-out ${SIDEBAR_MAX_WIDTH_TRANSITION_MS}ms`,
  `opacity ease-in-out ${SIDEBAR_MAX_WIDTH_TRANSITION_MS}ms`,
  `transform ease-in-out ${SIDEBAR_MAX_WIDTH_TRANSITION_MS}ms`,
].join(', ');

type AppSidebarProps = {
  sidebarState?: SidebarState;
  onOpenChange: (open: boolean) => void;
  overlayOpen?: boolean;
  onOverlayOpenChange?: (open: boolean) => void;
};

type SidebarHotkeyDeps = {
  isSlim: () => boolean;
  onOpenChange: (open: boolean) => void;
};

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
 * Navigate to a sidebar view by pushing a fresh entry into the active split.
 * Holding shift opens it in a new split. Use in-app back/forward to return to
 * prior entries.
 */
function navigateToSidebarView(args: {
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

const registerSidebarHotkeys = ({
  isSlim,
  onOpenChange,
}: SidebarHotkeyDeps) => {
  // Scoped to the sidebar's lifecycle on purpose: it toggles sidebar +
  // side-panel state, which is force-hidden (and thus a no-op) on full-cover
  // routes like solo settings, where `AppSidebar` unmounts. Genuinely global
  // shortcuts that must survive those routes live in `GoToHotkeys` instead.
  registerHotkey({
    hotkey: 'cmd+.',
    scopeId: 'global',
    hotkeyToken: TOKENS.global.toggleSidebar,
    description: 'Toggle sidebar',
    runWithInputFocused: true,
    keyDownHandler: (e) => {
      e?.preventDefault();
      const show = isSlim();
      onOpenChange(show);
      return true;
    },
  });
};

/** Session-only signal so a hint shows after dismissal until the user acknowledges or the timer expires. */
const [premiumHintVisible, setPremiumHintVisible] = createSignal(false);

type SidebarShortcutLinkProps = {
  label: string;
  icon: Component<{ triggerAnimation?: boolean; class?: string }>;
  onClick: () => void;
  isSlim: () => boolean;
  trailing?: JSX.Element;
};

const SidebarShortcutLink = (props: SidebarShortcutLinkProps) => {
  const [isHovering, setIsHovering] = createSignal(false);

  return (
    <div class="group/shortcut relative w-full">
      <NavRow
        draggable={false}
        class={cn(
          'h-7 group-hover/shortcut:bg-ink/3 group-hover/shortcut:text-ink',
          props.trailing && !props.isSlim() && 'pr-8'
        )}
        fullWidth
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
        <div class="relative size-5 shrink-0 flex items-center justify-center [&_svg]:size-3.5">
          <Dynamic component={props.icon} triggerAnimation={isHovering()} />
        </div>

        <div class="flex items-center gap-1 group-data-[slim=true]/sidebar:hidden">
          <span class="flex-1 min-w-0 whitespace-nowrap">{props.label}</span>
        </div>
      </NavRow>

      <Show when={props.trailing && !props.isSlim()}>
        <div class="absolute right-1 top-1/2 -translate-y-1/2 flex items-center">
          {props.trailing}
        </div>
      </Show>
    </div>
  );
};

const SidebarTryItemMenu = (props: {
  label: string;
  onDismiss: () => void;
  onOpenChange?: (open: boolean) => void;
}) => (
  <Dropdown
    placement="right-start"
    gutter={8}
    onOpenChange={props.onOpenChange}
  >
    <Dropdown.Trigger
      variant="ghost"
      class="shrink-0 opacity-0 group-hover/shortcut:pointer-events-auto group-hover/shortcut:opacity-100 focus-visible:opacity-100 transition-opacity rounded-md size-5 min-h-0 p-0 bg-transparent hover:bg-ink/6 [&_svg]:size-3.5 pointer-events-none"
      label={`${props.label} options`}
      onMouseDown={(e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e: MouseEvent) => e.stopPropagation()}
    >
      <DotsThreeIcon />
    </Dropdown.Trigger>
    <Dropdown.Content class="w-40 shadow-menu">
      <Dropdown.Group>
        <Dropdown.Item
          class="min-h-8 gap-2 px-2.5 text-[13px]"
          onSelect={props.onDismiss}
        >
          <span class="flex-1 truncate text-ink">Dismiss</span>
        </Dropdown.Item>
      </Dropdown.Group>
    </Dropdown.Content>
  </Dropdown>
);

const SidebarHeaderSearchButton = (props: { link: SidebarItem }) => {
  const analytics = useAnalytics();
  const layout = useSplitLayout();

  const openSearch = (event: MouseEvent) => {
    analytics.track('sidebar_click', { view: props.link.id });
    let currentContentHandle = globalSplitManager()?.activeSplit();
    const content = currentContentHandle?.content();

    if (
      currentContentHandle &&
      content?.type === 'component' &&
      content.id === 'search'
    ) {
      requestSearchFocus(currentContentHandle.id);
      globalSplitManager()?.returnFocus();
      return;
    }

    currentContentHandle = navigateToSidebarView({
      viewId: props.link.id,
      params: props.link.params,
      shiftKey: event.shiftKey,
      activeSplit: currentContentHandle,
      openWithSplit: layout.openWithSplit,
      referredFrom: 'sidebar',
    });
    if (currentContentHandle) requestSearchFocus(currentContentHandle.id);
    globalSplitManager()?.returnFocus();
  };

  return (
    <Button
      size="icon-sm"
      class="[&_svg]:size-4!"
      label="Search"
      hotkey={props.link.hotkeyToken}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
      }}
      onClick={openSearch}
    >
      <MagnifyingGlassIcon />
    </Button>
  );
};

type SidebarSettingsWidgetProps = {
  isSlim: () => boolean;
  onSelect: (tab: SettingsTab) => void;
  onMenuOpenChange?: (open: boolean) => void;
};

const SidebarSettingsWidget = (props: SidebarSettingsWidgetProps) => {
  const userId = useUserId();
  const email = useEmail();
  const logout = useLogout();

  const userName = useOwnUserName();

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
      placement="top-start"
      gutter={6}
      onOpenChange={props.onMenuOpenChange}
    >
      <Dropdown.Trigger
        variant="ghost"
        class={cn(
          'flex items-center rounded-md cursor-default text-ink-extra-muted not-disabled:hover:bg-ink/3 h-9',
          'justify-start gap-3 px-1.5 py-1'
        )}
        label={displayName()}
        fullWidth
        tooltipDisabled={!props.isSlim()}
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
            <div class="size-5 shrink-0">
              <UserIcon
                id={id()}
                size="fill"
                suppressClick
                showTooltip={false}
              />
            </div>
          )}
        </Show>
        <span class="flex-1 min-w-0 text-left whitespace-nowrap text-sm truncate group-data-[slim=true]/sidebar:hidden">
          {displayName()}
        </span>
        <CaretUpIcon class="size-3 text-ink-extra-muted shrink-0 group-data-[slim=true]/sidebar:hidden" />
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
 * Assemble the ordered sidebar link list: the static links plus Home, Getting
 * started, and the flag-gated Activity and CRM entries in their correct
 * positions. Calls is intentionally absent in this layout experiment.
 * Call from a reactive context — it reads `ENABLE_CRM()`.
 * `showGettingStarted` is the account-age gate (`useGettingStartedEnabled`),
 * passed in because this runs outside a component; when false the link is
 * fully absent — row, `g s` hotkey, and command menu entry.
 * Rendered sections additionally drop `hiddenFromSidebar` entries, which have
 * hotkeys but no sidebar row.
 */
const buildSidebarLinks = (showGettingStarted: boolean): SidebarItem[] => {
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

  if (ENABLE_CRM()) {
    // Customers sits just after Channels.
    const idx = links.findIndex((l) => l.id === 'channels');
    links = [
      ...links.slice(0, idx + 1),
      COMPANIES_LINK,
      ...links.slice(idx + 1),
    ];
  }

  return links;
};

const TeamInviteSidebarPromo = (props: { invite: TeamInviteDetails }) => {
  const [inviterName] = useDisplayName(tryMacroId(props.invite.invited_by));
  const joinTeamMutation = useJoinTeamMutation();
  const rejectInvitationMutation = useRejectInvitationMutation();
  const mutationPending = () =>
    joinTeamMutation.isPending || rejectInvitationMutation.isPending;

  return (
    <SidebarPromoCard
      label="Team invitation"
      description={`${inviterName() || 'A teammate'} invited you to join a team as ${props.invite.team_role}.`}
      primaryAction={{
        label: 'Accept',
        disabled: mutationPending(),
        onClick: () =>
          joinTeamMutation.mutate({ teamInviteId: props.invite.id }),
      }}
      secondaryAction={{
        label: 'Decline',
        disabled: mutationPending(),
        onClick: () =>
          rejectInvitationMutation.mutate({ teamInviteId: props.invite.id }),
      }}
    />
  );
};

const SIDEBAR_TABS: {
  id: SidebarTab;
  label: string;
  icon: () => JSX.Element;
}[] = [
  { id: 'views', label: 'Views', icon: () => <SquaresFourIcon /> },
  { id: 'channels', label: 'Channels', icon: () => <HashIcon /> },
  {
    id: 'agents',
    label: 'Agents',
    icon: () => <EntityIcon targetType="chat" size="sm" theme="monochrome" />,
  },
];

/** Horizontal icon-only tab bar that swaps the sidebar body content. */
const SidebarTabBar = (props: {
  active: SidebarTab;
  onSelect: (tab: SidebarTab) => void;
}) => (
  <div class="shrink-0 mt-3 flex items-center gap-1">
    <For each={SIDEBAR_TABS}>
      {(tab) => (
        <Tooltip label={tab.label} as="span" placement="bottom" class="flex-1">
          <button
            type="button"
            aria-label={tab.label}
            class={cn(
              'w-full h-7 flex items-center justify-center rounded-md cursor-default [&_svg]:size-4',
              props.active === tab.id
                ? 'bg-ink/6 text-ink'
                : 'text-ink-muted hover:bg-ink/3 hover:text-ink'
            )}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              props.onSelect(tab.id);
            }}
          >
            {tab.icon()}
          </button>
        </Tooltip>
      )}
    </For>
  </div>
);

const MARQUEE_MS_PER_PX = 25;
const MARQUEE_START_DELAY_MS = 300;
const MARQUEE_RESTART_DELAY_MS = 1000;

/**
 * Single-line text that ellipsizes at rest and, while `active` (row hover)
 * and actually overflowing, slides its content left at a constant speed to
 * reveal the clipped tail. After reaching the end it pauses briefly, snaps
 * back to the start, and scrolls again — looping while hovered. Slides back
 * to rest on unhover.
 */
const MarqueeText = (props: {
  active: boolean;
  class?: string;
  /**
   * Extra px to scroll past the measured overflow, e.g. the width of an
   * overlay covering the right edge (the Agents tab's floating timestamp)
   * so the tail clears it. Read at measure time.
   */
  endReservePx?: () => number;
  children: JSX.Element;
}) => {
  const [offset, setOffset] = createSignal(0);
  const [instant, setInstant] = createSignal(false);
  let outer: HTMLSpanElement | undefined;
  let inner: HTMLSpanElement | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const clearRestart = () => {
    if (restartTimer !== undefined) {
      clearTimeout(restartTimer);
      restartTimer = undefined;
    }
  };

  const startScroll = () => {
    if (!outer || !inner) return;
    // inner.scrollWidth is the full content width in both truncate and
    // w-max modes; outer.clientWidth is the visible clip.
    const overflow = inner.scrollWidth - outer.clientWidth;
    if (overflow > 1) {
      setInstant(false);
      setOffset(overflow + (props.endReservePx?.() ?? 0));
    }
  };

  createEffect(() => {
    if (props.active) {
      startScroll();
    } else {
      clearRestart();
      setInstant(false);
      setOffset(0);
    }
  });

  onCleanup(clearRestart);

  const scrolling = () => offset() > 0;

  const onTransitionEnd = (e: TransitionEvent) => {
    if (e.propertyName !== 'transform' || e.target !== inner) return;
    if (!props.active || offset() === 0) return;
    // Reached the end: pause, snap back to the start, then run again.
    clearRestart();
    restartTimer = setTimeout(() => {
      setInstant(true);
      setOffset(0);
      restartTimer = setTimeout(startScroll, MARQUEE_START_DELAY_MS);
    }, MARQUEE_RESTART_DELAY_MS);
  };

  return (
    <span ref={outer} class={cn('block min-w-0 overflow-hidden', props.class)}>
      <span
        ref={inner}
        class={cn(
          'block whitespace-nowrap',
          scrolling() ? 'w-max' : 'truncate'
        )}
        style={{
          transform: scrolling()
            ? `translateX(-${offset()}px)`
            : 'translateX(0)',
          // ~40px/s with a short delay so quick mouse passes don't scroll,
          // an instant snap when looping, and a fast ease back on unhover.
          transition: instant()
            ? 'none'
            : scrolling()
              ? `transform ${offset() * MARQUEE_MS_PER_PX}ms linear ${MARQUEE_START_DELAY_MS}ms`
              : 'transform 200ms ease-out',
        }}
        onTransitionEnd={onTransitionEnd}
      >
        {props.children}
      </span>
    </span>
  );
};

/**
 * An entity row for the Channels/Agents tabs. Top-aligned (not vertically
 * centered): an optional icon chip or user avatar on the left, the name with
 * a compact timestamp on the first line (optionally revealed only on hover),
 * and an optional muted preview/subtitle on the second. Truncated title and
 * subtitle text marquee-scrolls while the row is hovered. Opens on click,
 * new split on shift-click.
 */
const SidebarTabItemRow = (props: {
  entity: EntityData;
  /** Icon chip. Omit (with no `avatarUserId`) for a text-only row. */
  iconType?: EntityIconSelector;
  /** Renders this user's avatar instead of the icon chip (e.g. DMs). */
  avatarUserId?: string;
  timestamp?: DateValue | null;
  /** Only reveal the timestamp while the row is hovered. */
  timestampOnHover?: boolean;
  /**
   * Float the timestamp absolutely over the row's right edge instead of
   * taking flex space, so the title can fill the full width and isn't
   * truncated early (used by the Agents tab's title-only rows).
   */
  floatingTimestamp?: boolean;
  subtitle?: JSX.Element;
  /**
   * Only reveal the subtitle while the row is hovered. The row keeps its
   * two-line height so the list doesn't shift.
   */
  subtitleOnHover?: boolean;
  /**
   * Show the full name in a tooltip (when truncated) instead of marquee-
   * scrolling the title. The subtitle still marquees (used by Channels).
   */
  titleTooltip?: boolean;
}) => {
  const [isHovering, setIsHovering] = createSignal(false);
  const [titleTruncated, setTitleTruncated] = createSignal(false);
  let titleEl: HTMLSpanElement | undefined;
  let timestampEl: HTMLSpanElement | undefined;

  createEffect(() => {
    if (isHovering() && titleEl) {
      setTitleTruncated(titleEl.scrollWidth - titleEl.clientWidth > 1);
    }
  });

  return (
    <NavRow
      draggable={false}
      class={cn(
        'group/tabrow relative rounded-lg px-1.5 py-1.5 items-start',
        props.subtitle ? 'h-11' : 'h-8'
      )}
      fullWidth
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        void openEntityInSplitFromUnifiedList(props.entity, {
          openInNewSplit: e.shiftKey,
          referredFrom: 'sidebar',
        });
        globalSplitManager()?.returnFocus();
      }}
    >
      <Show when={props.avatarUserId}>
        {(id) => (
          <div class="size-6 shrink-0">
            <UserIcon id={id()} size="fill" suppressClick showTooltip={false} />
          </div>
        )}
      </Show>
      <Show when={!props.avatarUserId && props.iconType}>
        <div class="size-6 shrink-0 rounded-full bg-ink/5 flex items-center justify-center [&_svg]:size-3">
          <EntityIcon targetType={props.iconType} size="xs" />
        </div>
      </Show>
      <div class="min-w-0 flex-1 flex flex-col text-left group-data-[slim=true]/sidebar:hidden">
        <div class="flex items-baseline gap-2">
          <Show
            when={props.titleTooltip}
            fallback={
              <MarqueeText
                active={isHovering()}
                class="flex-1 text-[13px] font-medium text-ink"
                endReservePx={() =>
                  props.floatingTimestamp ? (timestampEl?.offsetWidth ?? 0) : 0
                }
              >
                {props.entity.name || 'Untitled'}
              </MarqueeText>
            }
          >
            <Tooltip
              label={props.entity.name || 'Untitled'}
              as="span"
              placement="top"
              class="min-w-0 flex-1"
              disabled={!titleTruncated()}
            >
              <span
                ref={titleEl}
                class="block truncate whitespace-nowrap text-[13px] font-medium text-ink"
              >
                {props.entity.name || 'Untitled'}
              </span>
            </Tooltip>
          </Show>
          <Show when={props.timestamp}>
            {(ts) => (
              <span
                ref={timestampEl}
                class={cn(
                  'shrink-0 text-xxs text-ink-extra-muted',
                  // Full-height overlay hugging the right edge, fading from
                  // transparent into the row's hover bg (ink/3 over surface)
                  // so the marquee text dissolves under the timestamp.
                  props.floatingTimestamp &&
                    'absolute inset-y-0 right-0 z-10 flex items-center rounded-r-lg pl-10 pr-1.5 bg-gradient-to-r from-transparent to-50% to-[color-mix(in_oklab,var(--color-ink)_3%,var(--color-surface))]',
                  // The floating variant is out of flow, so it can fade via
                  // opacity; the inline variant must fully drop out of the
                  // layout at rest or it steals title width and truncates
                  // the name too early.
                  props.timestampOnHover &&
                    (props.floatingTimestamp
                      ? 'opacity-0 transition-opacity group-hover/tabrow:opacity-100'
                      : 'hidden group-hover/tabrow:block')
                )}
              >
                {formatTimestamp(ts())}
              </span>
            )}
          </Show>
        </div>
        <Show when={props.subtitle}>
          <MarqueeText
            active={isHovering()}
            class={cn(
              'text-xs text-ink-muted leading-4',
              props.subtitleOnHover &&
                'opacity-0 transition-opacity group-hover/tabrow:opacity-100'
            )}
          >
            {props.subtitle}
          </MarqueeText>
        </Show>
      </div>
    </NavRow>
  );
};

const CHANNEL_TYPE_LABELS: Record<ChannelEntity['channelType'], string> = {
  direct_message: 'Direct message',
  private: 'Private channel',
  public: 'Public channel',
  team: 'Team channel',
};

/**
 * Second line of a channel row: latest message preview or the channel kind.
 * Empty DMs read as a dimmed "New conversation" instead of "Direct message".
 */
const SidebarChannelSubtitle = (props: { channel: ChannelEntity }) => (
  <Show
    when={props.channel.latestMessage}
    fallback={
      <Show
        when={props.channel.channelType === 'direct_message'}
        fallback={<span>{CHANNEL_TYPE_LABELS[props.channel.channelType]}</span>}
      >
        <span class="text-ink-extra-muted">New conversation</span>
      </Show>
    }
  >
    {(message) => (
      // Sized naturally (no self-truncation) so the row's MarqueeText can
      // measure the full preview width and scroll it on hover.
      <span class="inline-flex items-center gap-1 whitespace-nowrap">
        <span class="shrink-0">
          <DisplayName id={message().senderId} format="firstName" />:
        </span>
        <span>
          <Show
            when={message().content?.trim()}
            fallback={<span class="italic">Attached items</span>}
          >
            <StaticMarkdown
              theme={unifiedListMarkdownTheme}
              markdown={message().content}
              singleLine
            />
          </Show>
        </span>
      </span>
    )}
  </Show>
);

const TAB_LIST_LIMIT = 100;
const TAB_LIST_STALE_TIME = 60 * 1000;

/** Channels tab: your channels, most recently updated first. */
const SidebarChannelsTab = () => {
  const userId = useUserId();

  // DM rows show the other participant's avatar; a self-DM falls back to
  // the viewer (mirrors useFavoriteDmRecipientId).
  const dmRecipientId = (channel: ChannelEntity): string | undefined => {
    if (channel.channelType !== 'direct_message') return undefined;
    const ids = channel.participantIds ?? [];
    return ids.find((id) => id !== userId()) ?? ids[0] ?? userId();
  };

  const query = useSoupItemsQuery(
    () => ({
      params: { limit: TAB_LIST_LIMIT, sort_method: 'updated_at' },
      body: {
        ...QUERY_FILTERS_BASE,
        // channel_filters intentionally unset = all accessible channels
        channel_filters: undefined,
      },
    }),
    () => ({ staleTime: TAB_LIST_STALE_TIME })
  );

  const channels = createMemo<ChannelEntity[]>(
    () => query.data?.filter(isChannelEntity) ?? []
  );

  const [search, setSearch] = createSignal('');
  const filteredChannels = createMemo(() => {
    const q = search().trim().toLowerCase();
    if (!q) return channels();
    return channels().filter((channel) =>
      (channel.name ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div class="flex flex-col">
      <div class="mb-2 flex items-center gap-1.5">
        <div class="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-ink/4 px-2">
          <MagnifyingGlassIcon class="size-3.5 shrink-0 text-ink-extra-muted" />
          <input
            type="text"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
            placeholder="Search channels"
            class="min-w-0 flex-1 bg-transparent text-[13px] outline-none caret-accent placeholder:text-ink-placeholder"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          label="New message"
          class="shrink-0 size-7 bg-transparent text-ink-muted hover:text-ink [&_svg]:size-3.5!"
          onClick={() => openNewChannelModal()}
        >
          <PlusIcon />
        </Button>
      </div>
      <ul class="flex flex-col gap-0.5">
        <Show
          when={!query.isLoading}
          fallback={
            <li class="px-2 py-1 text-xs text-ink-extra-muted">
              Loading channels…
            </li>
          }
        >
          <Show
            when={filteredChannels().length > 0}
            fallback={
              <li class="px-2 py-1 text-xs text-ink-extra-muted">
                {search().trim() ? 'No matching channels' : 'No channels'}
              </li>
            }
          >
            <For each={filteredChannels()}>
              {(channel) => (
                <li>
                  <SidebarTabItemRow
                    entity={channel}
                    iconType={channel.channelType || 'channel'}
                    avatarUserId={dmRecipientId(channel)}
                    timestamp={
                      channel.latestMessage?.createdAt ??
                      channel.interactedAt ??
                      channel.updatedAt
                    }
                    timestampOnHover
                    subtitle={<SidebarChannelSubtitle channel={channel} />}
                    subtitleOnHover
                    titleTooltip
                  />
                </li>
              )}
            </For>
          </Show>
        </Show>
      </ul>
    </div>
  );
};

/** Agents tab: your agent chats, most recently updated first. */
const SidebarAgentsTab = () => {
  const query = useSoupItemsQuery(
    () => ({
      params: { limit: TAB_LIST_LIMIT, sort_method: 'updated_at' },
      body: {
        ...QUERY_FILTERS_BASE,
        // chat_filters intentionally unset = all accessible chats
        chat_filters: undefined,
      },
    }),
    () => ({ staleTime: TAB_LIST_STALE_TIME })
  );

  const chats = createMemo<ChatEntity[]>(
    () => query.data?.filter(isChatEntity) ?? []
  );

  return (
    <ul class="flex flex-col gap-0.5">
      <Show
        when={!query.isLoading}
        fallback={
          <li class="px-2 py-1 text-xs text-ink-extra-muted">
            Loading agent chats…
          </li>
        }
      >
        <Show
          when={chats().length > 0}
          fallback={
            <li class="px-2 py-1 text-xs text-ink-extra-muted">
              No agent chats
            </li>
          }
        >
          <For each={chats()}>
            {(chat) => (
              <li>
                <SidebarTabItemRow
                  entity={chat}
                  timestamp={chat.updatedAt}
                  timestampOnHover
                  floatingTimestamp
                />
              </li>
            )}
          </For>
        </Show>
      </Show>
    </ul>
  );
};

export const AppSidebar = (props: AppSidebarProps) => {
  const { openSettings, selectTab, settingsOpen } = useSettingsState();
  const isTabAvailable = useSettingsTabAvailable();
  const currentTeamQuery = useCurrentTeamQuery();
  const userInvitesQuery = useUserInvitesQuery();
  const firstTeamInvite = () => userInvitesQuery.data?.invites.at(0);
  // v2: key bumped when the Tasks tab became Channels, so a persisted
  // 'tasks' value from the earlier iteration can't stick around.
  const [activeTab, setActiveTab] = makePersisted(
    createSignal<SidebarTab>('views'),
    { name: 'sidebar-layout1-active-tab-v2' }
  );
  const [tryVisibility, setTryVisibility] = makePersisted(
    createSignal<TryItemVisibility>(DEFAULT_TRY_VISIBILITY),
    { name: 'sidebar-try-visibility' }
  );
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

  const gettingStartedEnabled = useGettingStartedEnabled();
  const allLinks = createMemo((): SidebarItem[] =>
    buildSidebarLinks(gettingStartedEnabled())
  );

  // Hides only the rendered row: the g+s hotkey and command menu entry keep
  // working (like `hiddenFromSidebar` links), so the page stays reachable.
  const gettingStartedVisibility = createGettingStartedSidebarVisibility();

  const openSettingsTab = (tab: SettingsTab) => {
    if (!isTabAvailable(tab)) return;
    if (settingsOpen()) {
      selectTab(tab);
      return;
    }
    openSettings(tab);
  };

  const isExpanded = () => props.sidebarState === 'expanded';
  const isCollapsed = () => props.sidebarState === 'slim';
  const overlayOpen = () => props.overlayOpen === true;
  const isOverlayExpanded = () => isCollapsed() && overlayOpen();
  const isExpandedView = () => isExpanded() || isOverlayExpanded();
  const isSlim = () => isCollapsed() && !isOverlayExpanded();
  const sidebarDisplayState = (): SidebarState =>
    isExpandedView() ? 'expanded' : (props.sidebarState ?? 'expanded');
  const currentTeamName = () => currentTeamQuery.data?.team.name?.trim();

  const [hasOverflowTop, setHasOverflowTop] = createSignal(false);
  const [hasOverflowBottom, setHasOverflowBottom] = createSignal(false);
  const [middleScrollRef, setMiddleScrollRef] = createSignal<HTMLDivElement>();
  const middleScrollSize = createElementSize(middleScrollRef);
  const [overlayPointerInside, setOverlayPointerInside] = createSignal(false);
  const [overlayDropdownOpen, setOverlayDropdownOpen] = createSignal(false);
  const [, setWorkspaceContextMenuOpen] = createSignal(false);
  let middleScrollFrame: number | undefined;
  let middleScrollObserver: MutationObserver | undefined;
  let overlayCloseTimer: ReturnType<typeof setTimeout> | undefined;
  let overlayDropdownCloseTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelOverlayClose = () => {
    if (overlayCloseTimer !== undefined) {
      clearTimeout(overlayCloseTimer);
      overlayCloseTimer = undefined;
    }
  };

  const requestOverlayClose = () => {
    if (!isCollapsed()) return;
    cancelOverlayClose();
    overlayCloseTimer = setTimeout(() => {
      overlayCloseTimer = undefined;
      if (!overlayPointerInside() && !overlayDropdownOpen()) {
        props.onOverlayOpenChange?.(false);
      }
    }, SIDEBAR_MAX_WIDTH_TRANSITION_MS);
  };

  const handleOverlayDropdownOpenChange = (open: boolean) => {
    if (!isCollapsed()) return;
    if (overlayDropdownCloseTimer !== undefined) {
      clearTimeout(overlayDropdownCloseTimer);
      overlayDropdownCloseTimer = undefined;
    }

    if (open) {
      setOverlayDropdownOpen(true);
      props.onOverlayOpenChange?.(true);
      cancelOverlayClose();
      return;
    }

    overlayDropdownCloseTimer = setTimeout(() => {
      overlayDropdownCloseTimer = undefined;
      setOverlayDropdownOpen(false);
      if (!overlayPointerInside()) requestOverlayClose();
    }, SIDEBAR_MAX_WIDTH_TRANSITION_MS);
  };

  const handleWorkspaceContextMenuOpenChange = (open: boolean) => {
    setWorkspaceContextMenuOpen(open);
    handleOverlayDropdownOpenChange(open);
  };

  const updateMiddleScrollShadows = () => {
    const el = middleScrollRef();
    if (!el) return;
    const maxScrollTop = el.scrollHeight - el.clientHeight;
    setHasOverflowTop(el.scrollTop > 1);
    setHasOverflowBottom(maxScrollTop - el.scrollTop > 1);
  };

  const scheduleMiddleScrollUpdate = () => {
    if (middleScrollFrame !== undefined)
      cancelAnimationFrame(middleScrollFrame);
    middleScrollFrame = requestAnimationFrame(() => {
      middleScrollFrame = undefined;
      updateMiddleScrollShadows();
    });
  };

  const attachMiddleScrollRef = (el: HTMLDivElement) => {
    middleScrollObserver?.disconnect();
    setMiddleScrollRef(el);
    middleScrollObserver = new MutationObserver(scheduleMiddleScrollUpdate);
    middleScrollObserver.observe(el, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    scheduleMiddleScrollUpdate();
  };

  onCleanup(() => {
    middleScrollObserver?.disconnect();
    if (middleScrollFrame !== undefined)
      cancelAnimationFrame(middleScrollFrame);
    if (overlayCloseTimer !== undefined) clearTimeout(overlayCloseTimer);
    if (overlayDropdownCloseTimer !== undefined) {
      clearTimeout(overlayDropdownCloseTimer);
    }
  });

  const findLink = (id: SidebarItem['id']) =>
    allLinks().find((link) => link.id === id && !link.hiddenFromSidebar);
  const searchLink = () => allLinks().find((link) => link.id === 'search');

  const renderSidebarLink = (link: SidebarItem) => (
    <Dynamic
      component={link.id === 'mail' ? SidebarMailLink : SidebarLink}
      {...link}
      sidebarState={sidebarDisplayState()}
      hotkeyVisible={goToHotkeyVisible()}
      onContextMenuOpenChange={handleOverlayDropdownOpenChange}
      removeAction={
        link.id === 'getting-started'
          ? {
              tooltip: 'Remove from sidebar',
              onRemove: () => {
                gettingStartedVisibility.hide();
                // Hiding drops the row only — the go-to hotkey and its
                // command-menu entry stay registered (see buildSidebarLinks),
                // so this stays true.
                toast.success('Removed from sidebar', {
                  subtext:
                    'You can always find Getting Started in the command menu.',
                });
              },
            }
          : undefined
      }
    />
  );

  const topLinks = createMemo(() =>
    ['home', 'getting-started', 'inbox', 'activity', 'documents']
      .filter(
        (id) => id !== 'getting-started' || !gettingStartedVisibility.hidden()
      )
      .map((id) => findLink(id))
      .filter((link): link is SidebarItem => link !== undefined)
  );

  const mainLinks = createMemo(() =>
    MAIN_LINK_IDS.map((id) => findLink(id)).filter(
      (link): link is SidebarItem => link !== undefined
    )
  );

  const dismissTryItem = (id: TryItemId) => {
    setTryVisibility({ ...tryVisibility(), [id]: false });
    scheduleMiddleScrollUpdate();
  };

  const tryItems = createMemo<CollapsibleSidebarSectionItem[]>(() => {
    const items: CollapsibleSidebarSectionItem[] = [];
    const addTryItem = (
      id: TryItemId,
      label: string,
      icon: Component<{ triggerAnimation?: boolean; class?: string }>,
      onClick: () => void
    ) => {
      if (!tryVisibility()[id]) return;

      const trailing = (
        <SidebarTryItemMenu
          label={label}
          onDismiss={() => dismissTryItem(id)}
          onOpenChange={handleWorkspaceContextMenuOpenChange}
        />
      );

      items.push({
        id,
        visible: () => (
          <SidebarShortcutLink
            label={label}
            isSlim={isSlim}
            onClick={onClick}
            icon={icon}
            trailing={trailing}
          />
        ),
        dropdown: () => (
          <SidebarShortcutLink
            label={label}
            isSlim={isSlim}
            onClick={onClick}
            icon={icon}
            trailing={trailing}
          />
        ),
      });
    };

    const connected = getSettingsTabItem('Connected');
    if (connected && isTabAvailable('Connected')) {
      addTryItem('connect', 'Connect', connected.icon, () =>
        openSettingsTab('Connected')
      );
    }

    addTryItem('invite', 'Invite', UsersThreeIcon, () =>
      setInviteModalOpen(true)
    );

    const mobile = getSettingsTabItem('Mobile App');
    if (mobile && isTabAvailable('Mobile App')) {
      addTryItem('mobile', 'Mobile', mobile.icon, () =>
        openSettingsTab('Mobile App')
      );
    }
    return items;
  });

  createEffect(() => {
    middleScrollSize.width;
    middleScrollSize.height;
    mainLinks().length;
    tryItems().length;
    activeTab();
    props.overlayOpen;
    scheduleMiddleScrollUpdate();
  });

  createEffect(() => {
    if (isCollapsed() && !overlayOpen()) {
      cancelOverlayClose();
      setOverlayPointerInside(false);
      setOverlayDropdownOpen(false);
      setWorkspaceContextMenuOpen(false);
    }
  });

  registerSidebarHotkeys({
    isSlim: isCollapsed,
    onOpenChange: props.onOpenChange,
  });

  return (
    <div
      class={cn(
        'group/sidebar flex flex-col gap-0 overflow-hidden bg-surface px-3 pb-3 pt-4 text-[13px]',
        isExpanded() && 'relative h-full shrink-0 max-w-55 w-55 opacity-100',
        props.sidebarState === 'hidden' &&
          'fixed left-0 top-0 bottom-0 h-full -translate-x-full max-w-0 w-0 opacity-0 pointer-events-none',
        isCollapsed() && 'fixed z-modal-content',
        isCollapsed() &&
          !overlayOpen() &&
          'left-0 inset-y-0 h-full max-w-0 w-0 opacity-0 pointer-events-none -translate-x-2',
        isOverlayExpanded() &&
          'left-0 inset-y-0 h-full max-w-55 w-55 opacity-100 translate-x-0 rounded-r-xl shadow-menu ring-1 ring-edge-muted'
      )}
      data-expanded={isExpandedView()}
      data-slim={isSlim()}
      style={{ transition: SIDEBAR_MAX_WIDTH_TRANSITION_STYLE }}
      onPointerEnter={() => {
        if (!isCollapsed()) return;
        setOverlayPointerInside(true);
        props.onOverlayOpenChange?.(true);
        cancelOverlayClose();
      }}
      onPointerLeave={() => {
        if (!isCollapsed()) return;
        setOverlayPointerInside(false);
        requestOverlayClose();
      }}
    >
      <div class="shrink-0 flex items-center justify-between w-full relative group/logo-area">
        <div class="text-accent min-w-0 flex flex-1 items-center gap-2 pl-2">
          <div class="size-5 shrink-0 flex items-center justify-center">
            <LogoIcon class="size-4" />
          </div>
          <Show when={currentTeamName()}>
            {(teamName) => (
              <span class="min-w-0 truncate text-[13px] font-medium text-ink">
                {teamName()}
              </span>
            )}
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <Show when={searchLink()}>
            {(link) => <SidebarHeaderSearchButton link={link()} />}
          </Show>
          <SidebarCreateMenu
            isSlim={isSlim}
            variant="icon"
            onMenuOpenChange={handleOverlayDropdownOpenChange}
          />
        </div>
      </div>

      <nav class="shrink-0 mt-2">
        <ul class="size-full flex flex-col gap-0.5">
          <For each={topLinks()}>
            {(link) => (
              <li class="flex flex-col items-center justify-center">
                {renderSidebarLink(link)}
              </li>
            )}
          </For>
        </ul>
      </nav>

      <SidebarTabBar active={activeTab()} onSelect={setActiveTab} />

      <div class="relative min-h-0 flex-1 my-3">
        <div
          ref={attachMiddleScrollRef}
          onScroll={updateMiddleScrollShadows}
          class="size-full overflow-y-auto flex flex-col gap-3"
        >
          <Show when={activeTab() === 'views'}>
            <ul class="flex flex-col gap-0.5">
              <For each={mainLinks()}>
                {(link) => (
                  <li class="flex flex-col items-center justify-center">
                    {renderSidebarLink(link)}
                  </li>
                )}
              </For>
            </ul>

            <Suspense>
              <FavoritesSection
                sidebarState={sidebarDisplayState()}
                onContextMenuOpenChange={handleOverlayDropdownOpenChange}
              />
            </Suspense>

            <Suspense>
              <ChannelsRecentWidget
                sidebarState={sidebarDisplayState()}
                onSectionOpenChange={scheduleMiddleScrollUpdate}
                onDropdownOpenChange={handleOverlayDropdownOpenChange}
              />
            </Suspense>

            <Show when={tryItems().length > 0}>
              <CollapsibleSidebarSection
                label="Explore"
                icon={<LightbulbIcon class="text-alert" />}
                items={tryItems()}
                onOpenChange={scheduleMiddleScrollUpdate}
              />
            </Show>
          </Show>

          <Show when={activeTab() === 'channels'}>
            <SidebarChannelsTab />
          </Show>

          <Show when={activeTab() === 'agents'}>
            <SidebarAgentsTab />
          </Show>
        </div>
        <div
          class={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-3 transition-opacity bg-gradient-to-b from-surface to-transparent',
            hasOverflowTop() ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div
          class={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 h-3 transition-opacity bg-gradient-to-t from-surface to-transparent',
            hasOverflowBottom() ? 'opacity-100' : 'opacity-0'
          )}
        />
      </div>

      <div class="shrink-0 w-full pt-2 flex flex-col gap-2">
        <Show when={isExpandedView()}>
          <SidebarActiveCallWidget
            sidebarState="expanded"
            class="rounded-xl border border-edge-muted bg-surface shadow-menu p-1"
          />
        </Show>
        <Show when={isExpandedView() && callCtx?.isInCall()}>
          <div data-ui="sidebar-in-call-panel">
            <InCallPanel isSlim={() => false} />
          </div>
        </Show>
        <Show keyed when={isExpandedView() ? firstTeamInvite() : undefined}>
          {(invite) => <TeamInviteSidebarPromo invite={invite} />}
        </Show>
        <Show
          when={
            !hasPaidAccess() &&
            isExpandedView() &&
            !userInvitesQuery.isLoading &&
            !firstTeamInvite() &&
            !premiumCardDismissed() &&
            newPricingFF().enabled
          }
        >
          <SidebarPromoCard
            label="Upgrade to Premium"
            description="Unlock MCP integrations, better AI models, and team collaboration."
            onDismiss={() => {
              setPremiumCardDismissed(true);
              setPremiumHintVisible(true);
            }}
            primaryAction={{
              label: 'Upgrade',
              onClick: () => openSettingsTab('Billing'),
            }}
            secondaryAction={{
              label: 'Later',
              onClick: () => {
                setPremiumCardDismissed(true);
                setPremiumHintVisible(true);
              },
            }}
          />
        </Show>
        <Show
          when={
            !hasPaidAccess() &&
            isExpandedView() &&
            !userInvitesQuery.isLoading &&
            !firstTeamInvite() &&
            premiumHintVisible() &&
            premiumCardDismissed() &&
            newPricingFF().enabled
          }
        >
          <SidebarPromoHint
            title="Maybe later"
            message="You can upgrade anytime from Account settings."
            onDone={() => setPremiumHintVisible(false)}
            secondaryAction={{
              label: 'Take me there',
              onClick: () => openSettingsTab('Account'),
            }}
          />
        </Show>
        <SidebarSettingsWidget
          isSlim={isSlim}
          onSelect={openSettingsTab}
          onMenuOpenChange={handleOverlayDropdownOpenChange}
        />
      </div>
      <InviteModal />
    </div>
  );
};

interface SidebarLinkProps extends SidebarItem {
  sidebarState: SidebarState;
  hotkeyVisible: boolean;
  onContextMenuOpenChange?: (open: boolean) => void;
  /**
   * Skip the active background/text even when the view is active — used when
   * a nested row (e.g. a single selected inbox) carries the highlight instead.
   */
  suppressActiveStyle?: boolean;
  /** Called when the link is clicked while its view is already active. */
  onActiveClick?: () => void;
  /**
   * Rendered at the link's right edge while the view is active, in place of
   * the hover hotkey hints (the shortcut is redundant once active) — e.g. the
   * Email link's expand chevron.
   */
  trailingWhenActive?: JSX.Element;
  /**
   * Swaps the icon for an X while the row is hovered (expanded sidebar only —
   * in slim mode the icon is the whole row, so the swap would hijack
   * navigation). Clicking the X calls `onRemove` instead of navigating.
   */
  removeAction?: { tooltip: string; onRemove: () => void };
}

const SidebarLink = (props: SidebarLinkProps) => {
  const [isHovering, setIsHovering] = createSignal(false);

  const analytics = useAnalytics();
  const layout = useSplitLayout();

  const location = useLocation();

  // Always read the manager signal live: it is undefined until the split
  // layout mounts, which happens after the sidebar.
  const isActive = () => {
    const activeContent = globalSplitManager()?.activeSplit()?.content();

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
      params: props.params,
    }) as const;
  const canOpenInNewSplit = () =>
    globalSplitManager()?.canAppendSplit() ?? true;
  const canOpenFullscreen = () => layout.getSplitCount() > 1;

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
    const split = layout.replaceAllSplits(content(), {
      referredFrom: 'sidebar',
    });
    if (props.id === 'search' && split) requestSearchFocus(split.id);
    globalSplitManager()?.returnFocus();
  };

  return (
    <ContextMenu onOpenChange={props.onContextMenuOpenChange}>
      <ContextMenu.Trigger class="w-full h-7">
        <NavRow
          draggable={false}
          data-sidebar-link={props.id}
          data-active={isActive() ? '' : undefined}
          active={isActive() && !props.suppressActiveStyle}
          class="h-7"
          fullWidth
          tooltipPlacement="right"
          onMouseEnter={() => setIsHovering(true)}
          label={`Go to ${props.label}`}
          hotkey={
            props.standaloneHotkey
              ? props.hotkeyToken
              : [TOKENS.sidebar.goToLeader, props.hotkeyToken]
          }
          tooltipDisabled={props.sidebarState !== 'slim'}
          onMouseLeave={() => setIsHovering(false)}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            analytics.track('sidebar_click', {
              view: props.id,
            });

            e.preventDefault();
            let currentContentHandle = globalSplitManager()?.activeSplit();

            const currentContent = currentContentHandle?.content();
            const isSameContent =
              currentContent?.type === 'component' &&
              currentContent?.id === props.id;

            if (!isSameContent || e.shiftKey) {
              currentContentHandle = navigateToSidebarView({
                viewId: props.id,
                params: props.params,
                shiftKey: e.shiftKey,
                activeSplit: currentContentHandle,
                openWithSplit: layout.openWithSplit,
                referredFrom: 'sidebar',
              });
            } else {
              props.onActiveClick?.();
            }

            if (props.id === 'search' && currentContentHandle) {
              requestSearchFocus(currentContentHandle.id);
            }

            globalSplitManager()?.returnFocus();
          }}
        >
          <Show when={props.icon}>
            <div class="size-5 shrink-0 flex items-center justify-center [&_svg]:size-3.5">
              <Show
                when={
                  isHovering() && props.sidebarState !== 'slim'
                    ? props.removeAction
                    : undefined
                }
                fallback={
                  <Dynamic
                    component={props.icon}
                    triggerAnimation={isHovering()}
                  />
                }
              >
                {(removeAction) => (
                  <Tooltip
                    label={removeAction().tooltip}
                    as="span"
                    placement="top"
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={removeAction().tooltip}
                      class="flex items-center justify-center text-ink-muted
                     rounded-md hover:bg-failure hover:text-surface p-1"
                      onMouseDown={(e) => {
                        // The row navigates on mousedown; the X must not.
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        removeAction().onRemove();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          removeAction().onRemove();
                        }
                      }}
                    >
                      <XIcon />
                    </span>
                  </Tooltip>
                )}
              </Show>
            </div>
          </Show>

          <div class="flex items-center gap-1 group-data-[slim=true]/sidebar:hidden">
            <span class="whitespace-nowrap">{props.label}</span>
          </div>

          <Show
            when={
              isActive() &&
              props.trailingWhenActive !== undefined &&
              !props.hotkeyVisible
            }
          >
            <div class="group-data-[slim=true]/sidebar:hidden ml-auto flex items-center text-ink-muted">
              {props.trailingWhenActive}
            </div>
          </Show>

          <Show
            when={
              isHovering() &&
              !props.hotkeyVisible &&
              !(isActive() && props.trailingWhenActive !== undefined)
            }
          >
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
        </NavRow>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenuContent class="text-xs text-ink-muted">
          <MenuItem
            text="Open in new split"
            onClick={openInNewSplit}
            disabled={!canOpenInNewSplit()}
          />
          <Show when={canOpenFullscreen()}>
            <MenuItem text="Open fullscreen" onClick={openFullscreen} />
          </Show>
          <MenuItem text="Open in current split" onClick={openInCurrentSplit} />
        </ContextMenuContent>
      </ContextMenu.Portal>
    </ContextMenu>
  );
};

/**
 * The Email sidebar link, acting as a dropdown for the user's linked inboxes.
 * With multiple inboxes linked, the active link swaps its hotkey hint for a
 * chevron; clicking the already-active link fans out a nested row per inbox,
 * and clicking it again collapses the rows and returns to the unified inbox
 * (all inboxes).
 *
 * The open/closed state is a plain user toggle, persisted across reloads —
 * navigating to other views or into an email block never collapses the rows.
 *
 * Clicking an inbox row scopes the email list to only that inbox (the same
 * `inboxFilter` the topbar inbox dropdown drives), navigating back to the
 * list first if some other view is active. A row carries the active highlight
 * only when it is the single selected inbox (read from the live mail view, or
 * from the filter its history entry captured when something else is on top),
 * in which case the parent link yields its own.
 */
const SidebarMailLink = (props: SidebarLinkProps) => {
  const layout = useSplitLayout();
  const linksQuery = useEmailLinksQuery();
  const [expanded, setExpanded] = makePersisted(createSignal(false), {
    name: 'sidebar-mail-accounts-expanded',
  });

  const links = createMemo(() =>
    [...(linksQuery.data?.links ?? [])].sort((a, b) =>
      a.email_address.localeCompare(b.email_address)
    )
  );

  const isMailList = (content: SplitContent | undefined) =>
    content?.type === 'component' && content.id === 'mail';

  const canShow = () => props.sidebarState === 'expanded' && links().length > 1;

  const showAccounts = () => canShow() && expanded();

  const selectedIds = () => {
    // Read the manager signal live: it is undefined until the split layout
    // mounts, which can be after the sidebar.
    const split = globalSplitManager()?.activeSplit();
    if (!split) return undefined;
    // Registered only while the split's mail list view is mounted.
    const controller = getInboxFilterSplit(split.id);
    if (controller) return controller.inboxFilter();
    // Something else is on top (an email block, another view) — read the
    // filter the mail list captured into its history entry on nav-away.
    const entries = split.history();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (isMailList(entry)) {
        return entry.state?.[INBOX_FILTER_ENTRY_KEY] as string[] | undefined;
      }
    }
    return undefined;
  };

  const onlySelectedId = () => {
    const ids = selectedIds();
    return ids?.length === 1 ? ids[0] : undefined;
  };

  // Scope the list to one inbox, first returning to the mail list (restoring
  // the history entry if there is one) when some other view is active. The
  // filter request is queued and applied as the list mounts.
  const selectOnly = (linkId: string) => {
    const manager = globalSplitManager();
    let split = manager?.activeSplit();
    if (!isMailList(split?.content())) {
      split = navigateToSidebarView({
        viewId: 'mail',
        shiftKey: false,
        activeSplit: split,
        openWithSplit: layout.openWithSplit,
        referredFrom: 'sidebar',
      });
    }
    if (!split) return;
    requestInboxFilter(split.id, [linkId]);
    manager?.returnFocus();
  };

  return (
    <>
      <SidebarLink
        {...props}
        suppressActiveStyle={showAccounts() && onlySelectedId() !== undefined}
        onActiveClick={() => {
          if (!canShow()) return;
          if (!expanded()) {
            setExpanded(true);
            return;
          }
          // Collapsing also returns to the unified inbox. Only fired while
          // the mail list is the active content, so target the active split.
          setExpanded(false);
          const split = globalSplitManager()?.activeSplit();
          if (split) requestInboxFilter(split.id, undefined);
        }}
        trailingWhenActive={
          canShow() ? (
            <CaretRightIcon
              class={cn(
                'size-3 transition-transform duration-200',
                expanded() && 'rotate-90'
              )}
            />
          ) : undefined
        }
      />
      <Show when={canShow()}>
        <div
          class="grid w-full transition-[grid-template-rows] duration-200 ease-out"
          style={{ 'grid-template-rows': expanded() ? '1fr' : '0fr' }}
        >
          <ul class="min-h-0 overflow-hidden flex flex-col gap-0.5">
            <For each={links()}>
              {(link, index) => (
                <li
                  class={cn(
                    'flex items-center justify-center first:mt-0.5 transition-[opacity,transform] duration-200 ease-out',
                    expanded()
                      ? 'opacity-100 translate-y-0'
                      : 'opacity-0 -translate-y-2'
                  )}
                  style={{
                    'transition-delay': expanded()
                      ? `${index() * 30}ms`
                      : '0ms',
                  }}
                >
                  <NavRow
                    draggable={false}
                    disabled={!expanded()}
                    data-sidebar-mail-account={link.email_address}
                    data-active={onlySelectedId() === link.id ? '' : undefined}
                    active={onlySelectedId() === link.id}
                    class="h-7 pl-6 pr-2"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      selectOnly(link.id);
                    }}
                  >
                    <UserIcon
                      {...inboxIconProps(link.email_address)}
                      photoUrl={link.photo_url ?? undefined}
                      size="sm"
                      suppressClick
                      showTooltip={false}
                    />
                    <span class="truncate">{link.email_address}</span>
                  </NavRow>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </>
  );
};
