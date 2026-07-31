import { LIST_VIEW_PATHS, type ListView } from '@app/constants/list-views';
import { buildDocumentTypeQuery } from '@app/features/next-soup/filters/configs/document-type-query';
import { getDocumentsFilterSplit } from '@app/features/next-soup/soup-view/documents-filter-controllers';
import type { useSplitLayout } from '@components/app/split-layout/layout';
import type {
  ReferredFrom,
  SplitHandle,
} from '@components/app/split-layout/layoutManager';
import {
  ENABLE_ACTIVITY,
  ENABLE_CALLS,
  ENABLE_CRM,
} from '@core/constant/featureFlags';
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
import { makePersisted } from '@solid-primitives/storage';
import { type Component, createSignal, type JSX } from 'solid-js';
/**
 * Link data, navigation helpers, and persisted customization shared by both
 * sidebar variants (the wide list in `sidebar.tsx` and the Slack-style rail in
 * `narrow-sidebar.tsx`) plus the always-mounted `GoToHotkeys` registrar, so
 * their link sets can't drift.
 */

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
 * `expanded` is the wide list, `narrow` the icon-and-label rail, `slim` hides
 * the sidebar behind a hover overlay, and `hidden` drops it entirely (mobile).
 */
export type SidebarState = 'hidden' | 'expanded' | 'narrow' | 'slim';

/** The two states in which the sidebar occupies layout space. */
export type VisibleSidebarState = Extract<SidebarState, 'expanded' | 'narrow'>;

export type SidebarSectionLinkId =
  | 'mail'
  | 'channels'
  | 'calls'
  | 'documents'
  | 'tasks'
  | 'agents'
  | 'companies';

type SidebarSectionVisibility = Record<SidebarSectionLinkId, boolean>;

export type TryItemId = 'connect' | 'invite' | 'mobile';

type TryItemVisibility = Record<TryItemId, boolean>;

export const WORKSPACE_LINK_IDS = [
  'mail',
  'channels',
  'calls',
  'documents',
  'tasks',
  'agents',
  'companies',
] as const;

const DEFAULT_SECTION_VISIBILITY: SidebarSectionVisibility = {
  mail: true,
  channels: true,
  calls: true,
  documents: true,
  tasks: true,
  agents: true,
  companies: true,
};

const DEFAULT_TRY_VISIBILITY: TryItemVisibility = {
  connect: true,
  invite: true,
  mobile: true,
};

/**
 * Which workspace links the user kept in the sidebar. Module scope (like
 * `sidebar-state` in `Layout.tsx`) so the wide list and the narrow rail read
 * and write the same customization — only one of them is mounted at a time.
 */
export const [sectionVisibility, setSectionVisibility] = makePersisted(
  createSignal<SidebarSectionVisibility>(DEFAULT_SECTION_VISIBILITY),
  { name: 'sidebar-section-visibility' }
);

/** Dismissal state for the "Try" shortcuts; shared for the same reason. */
export const [tryVisibility, setTryVisibility] = makePersisted(
  createSignal<TryItemVisibility>(DEFAULT_TRY_VISIBILITY),
  { name: 'sidebar-try-visibility' }
);

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
 * Assemble the ordered sidebar link list: the static links plus Home, Getting
 * started, and the flag-gated Activity, Calls, and CRM entries in their
 * correct positions.
 * Shared by both rendered sidebar variants and the always-mounted
 * `GoToHotkeys` registrar so their link sets can't drift. Call from a reactive
 * context — it reads `ENABLE_CALLS()` / `ENABLE_CRM()`.
 * `showGettingStarted` is the account-age gate (`useGettingStartedEnabled`),
 * passed in because this runs outside a component; when false the link is
 * fully absent — row, `g s` hotkey, and command menu entry.
 * Rendered sections additionally drop `hiddenFromSidebar` entries, which have
 * hotkeys but no sidebar row.
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
 * Whether the "g" leader key is currently awaiting a destination key. Lives
 * at module scope so it can drive the hint overlay on the sidebar's nav
 * icons even though the registration is owned by `GoToHotkeys`, which stays
 * mounted regardless of whether the sidebar itself is visible.
 */
export const [goToHotkeyVisible, setGoToHotkeyVisible] = createSignal(false);

export const resetGoToHotkeysState = () => {
  setGoToHotkeyVisible(false);
  // To prevent the next key from triggering the hotkey handler,
  // we reset the pressed keys state and exit the command scope
  clearPressedKeys();
  activateClosestDOMScope();
};
