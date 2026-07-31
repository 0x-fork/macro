import { SidebarCreateMenu } from '@app/features/command/sidebar/sidebar-create-menu';
import { useGettingStartedEnabled } from '@app/features/getting-started/account-gate';
import { createGettingStartedSidebarVisibility } from '@app/features/getting-started/sidebar-visibility';
import { requestSearchFocus } from '@app/features/next-soup/soup-view/search-controllers';
import {
  InviteModal,
  setInviteModalOpen,
} from '@app/features/team-invitations/invite-modal';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  RAIL_BUTTON_CLASS,
  RAIL_LABEL_CLASS,
  RAIL_TILE_ACTIVE_CLASS,
  RAIL_TILE_CLASS,
} from '@components/app/app-sidebar/narrow-sidebar-styles';
import { SidebarDropdownLink } from '@components/app/app-sidebar/sidebar-dropdown-link';
import {
  buildSidebarLinks,
  goToHotkeyVisible,
  navigateToSidebarView,
  sectionVisibility,
  type SidebarItem,
  type SidebarState,
  type TryItemId,
  tryVisibility,
  WORKSPACE_LINK_IDS,
} from '@components/app/app-sidebar/sidebar-links';
import { SidebarSettingsWidget } from '@components/app/app-sidebar/sidebar-settings-widget';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { ContextMenuContent, MenuItem } from '@core/component/ContextMenu';
import {
  type SettingsTab,
  useSettingsState,
} from '@core/constant/SettingsState';
import {
  getSettingsTabItem,
  useSettingsTabAvailable,
} from '@core/constant/settingsTabsConfig';
import { TOKENS } from '@core/hotkey/tokens';
import LogoIcon from '@icon/macro-logo.svg';
import { ContextMenu } from '@kobalte/core/context-menu';
import DotsThreeIcon from '@phosphor/dots-three.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import { useLocation } from '@solidjs/router';
import { Button, cn, Dropdown, Hotkey } from '@ui';
import { type Component, createMemo, createSignal, For, Show } from 'solid-js';
import { Dynamic } from 'solid-js/web';

/**
 * The narrow sidebar: a Slack-style rail of big buttons, one per feature —
 * a wide icon tile with the feature name underneath. It replaces the wide
 * sidebar's scrolling list rather than sitting next to it, so everything that
 * only makes sense at full width (favorites, recent channels, promo cards,
 * per-inbox rows) is left to the wide variant; workspace links the user hid,
 * plus the "Try" shortcuts, stay reachable through the rail's More menu.
 */

type NarrowSidebarProps = {
  /** Switch variants — the logo tile uses it to go back to the wide list. */
  onStateChange: (state: SidebarState) => void;
};

type NarrowSidebarLinkProps = {
  link: SidebarItem;
};

/**
 * One rail button. Mirrors the wide sidebar row's behavior — mousedown
 * navigates, shift opens a new split, right-click offers the split targets —
 * with the label under the icon instead of beside it.
 */
const NarrowSidebarLink = (props: NarrowSidebarLinkProps) => {
  const [isHovering, setIsHovering] = createSignal(false);
  const analytics = useAnalytics();
  const layout = useSplitLayout();
  const location = useLocation();

  // Always read the manager signal live: it is undefined until the split
  // layout mounts, which happens after the sidebar.
  const isActive = () => {
    const activeContent = globalSplitManager()?.activeSplit()?.content();
    if (!activeContent) {
      const paths = location.pathname.split('/').filter(Boolean);
      return paths.includes(props.link.id);
    }
    return activeContent.id === props.link.id;
  };

  const content = () =>
    ({
      type: 'component',
      id: props.link.id,
      params: props.link.params,
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
    if (props.link.id === 'search' && split) requestSearchFocus(split.id);
    globalSplitManager()?.returnFocus();
  };

  const navigate = (shiftKey: boolean) => {
    analytics.track('sidebar_click', { view: props.link.id });
    let handle = globalSplitManager()?.activeSplit();
    const currentContent = handle?.content();
    const isSameContent =
      currentContent?.type === 'component' &&
      currentContent.id === props.link.id;

    // Re-focusing the search input is the useful no-op when Search is already
    // up; every other link simply stays put.
    if (!isSameContent || shiftKey) {
      handle = navigateToSidebarView({
        viewId: props.link.id,
        params: props.link.params,
        shiftKey,
        activeSplit: handle,
        openWithSplit: layout.openWithSplit,
        referredFrom: 'sidebar',
      });
    }

    if (props.link.id === 'search' && handle) requestSearchFocus(handle.id);
    globalSplitManager()?.returnFocus();
  };

  return (
    <ContextMenu>
      <ContextMenu.Trigger class="w-full">
        <Button
          variant="ghost"
          fullWidth
          draggable={false}
          data-sidebar-link={props.link.id}
          data-active={isActive() ? '' : undefined}
          class={RAIL_BUTTON_CLASS}
          label={`Go to ${props.link.label}`}
          hotkey={
            props.link.standaloneHotkey
              ? props.link.hotkeyToken
              : [TOKENS.sidebar.goToLeader, props.link.hotkeyToken]
          }
          tooltipPlacement="right"
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            navigate(e.shiftKey);
          }}
        >
          <div
            class={cn(
              RAIL_TILE_CLASS,
              isActive() && RAIL_TILE_ACTIVE_CLASS,
              'relative'
            )}
          >
            <Show when={props.link.icon}>
              <Dynamic
                component={props.link.icon}
                triggerAnimation={isHovering()}
              />
            </Show>
            <Show when={goToHotkeyVisible()}>
              <div class="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center overflow-hidden rounded-xs border border-accent/30 bg-accent/10 text-xs text-accent">
                <Hotkey token={props.link.hotkeyToken} />
              </div>
            </Show>
          </div>
          <span class={RAIL_LABEL_CLASS}>{props.link.label}</span>
        </Button>
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

type NarrowTryItem = {
  id: TryItemId;
  label: string;
  icon: Component<{ triggerAnimation?: boolean; class?: string }>;
  onSelect: () => void;
};

/**
 * The rail's overflow menu: the workspace links the user hid from the sidebar
 * plus the "Try" shortcuts, which have no room of their own on the rail.
 */
const NarrowMoreMenu = (props: {
  hiddenLinks: SidebarItem[];
  tryItems: NarrowTryItem[];
}) => (
  <Dropdown placement="right-start" gutter={8}>
    <Dropdown.Trigger
      as={Button}
      variant="ghost"
      fullWidth
      class={RAIL_BUTTON_CLASS}
      label="More"
      tooltipPlacement="right"
      onMouseDown={(e: MouseEvent) => {
        if (e.button !== 0) return;
        e.preventDefault();
      }}
    >
      <div class={RAIL_TILE_CLASS}>
        <DotsThreeIcon />
      </div>
      <span class={RAIL_LABEL_CLASS}>More</span>
    </Dropdown.Trigger>
    <Dropdown.Content class="w-56 shadow-menu">
      <Show when={props.hiddenLinks.length > 0}>
        <Dropdown.Group>
          <Dropdown.GroupLabel>Workspace</Dropdown.GroupLabel>
          <For each={props.hiddenLinks}>
            {(link) => <SidebarDropdownLink {...link} />}
          </For>
        </Dropdown.Group>
      </Show>
      <Show when={props.tryItems.length > 0}>
        <Dropdown.Group>
          <Dropdown.GroupLabel>Try</Dropdown.GroupLabel>
          <For each={props.tryItems}>
            {(item) => (
              <Dropdown.Item
                class="min-h-8 gap-2 px-2.5 text-[13px]"
                onSelect={item.onSelect}
              >
                <div class="shrink-0 [&_svg]:size-3.5">
                  <Dynamic component={item.icon} />
                </div>
                <span class="min-w-0 flex-1 truncate text-ink">
                  {item.label}
                </span>
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Show>
    </Dropdown.Content>
  </Dropdown>
);

export const NarrowSidebar = (props: NarrowSidebarProps) => {
  const { openSettings, selectTab, settingsOpen } = useSettingsState();
  const isTabAvailable = useSettingsTabAvailable();
  const gettingStartedEnabled = useGettingStartedEnabled();
  const gettingStartedVisibility = createGettingStartedSidebarVisibility();

  const allLinks = createMemo((): SidebarItem[] =>
    buildSidebarLinks(gettingStartedEnabled())
  );

  const findLink = (id: SidebarItem['id']) =>
    allLinks().find((link) => link.id === id && !link.hiddenFromSidebar);

  const openSettingsTab = (tab: SettingsTab) => {
    if (!isTabAvailable(tab)) return;
    if (settingsOpen()) {
      selectTab(tab);
      return;
    }
    openSettings(tab);
  };

  /**
   * Search leads the rail (it is `hiddenFromSidebar` in the wide list, which
   * carries it in the header instead), then the top-level views, then the
   * workspace links the user kept.
   */
  const railLinks = createMemo(() => {
    const search = allLinks().find((link) => link.id === 'search');
    const top = ['home', 'getting-started', 'inbox', 'activity']
      .filter(
        (id) => id !== 'getting-started' || !gettingStartedVisibility.hidden()
      )
      .map((id) => findLink(id));
    const workspace = WORKSPACE_LINK_IDS.filter(
      (id) => sectionVisibility()[id]
    ).map((id) => findLink(id));

    return [search, ...top, ...workspace].filter(
      (link): link is SidebarItem => link !== undefined
    );
  });

  const hiddenWorkspaceLinks = createMemo(() =>
    WORKSPACE_LINK_IDS.filter((id) => !sectionVisibility()[id])
      .map((id) => findLink(id))
      .filter((link): link is SidebarItem => link !== undefined)
  );

  const tryItems = createMemo<NarrowTryItem[]>(() => {
    const items: NarrowTryItem[] = [];
    const addTryItem = (
      id: TryItemId,
      label: string,
      icon: NarrowTryItem['icon'],
      onSelect: () => void
    ) => {
      if (!tryVisibility()[id]) return;
      items.push({ id, label, icon, onSelect });
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

  const showMore = () =>
    hiddenWorkspaceLinks().length > 0 || tryItems().length > 0;

  return (
    <div
      class="group/sidebar relative flex h-full w-18 shrink-0 flex-col items-center overflow-hidden bg-surface pt-2.5 pb-2 text-[13px]"
      data-sidebar="narrow"
    >
      <Button
        variant="ghost"
        class="size-9 shrink-0 rounded-lg p-0 text-accent"
        label="Expand sidebar"
        hotkey={TOKENS.global.toggleSidebar}
        tooltipPlacement="right"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
        }}
        onClick={() => props.onStateChange('expanded')}
      >
        <LogoIcon class="size-5" />
      </Button>

      <nav class="mt-2 min-h-0 w-full flex-1 overflow-y-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul class="flex w-full flex-col items-center gap-0.5">
          <For each={railLinks()}>
            {(link) => (
              <li class="w-full">
                <NarrowSidebarLink link={link} />
              </li>
            )}
          </For>
          <Show when={showMore()}>
            <li class="w-full">
              <NarrowMoreMenu
                hiddenLinks={hiddenWorkspaceLinks()}
                tryItems={tryItems()}
              />
            </li>
          </Show>
        </ul>
      </nav>

      <div class="mt-1 flex w-full shrink-0 flex-col items-center gap-1 border-t border-edge-muted px-1.5 pt-2">
        <SidebarCreateMenu isSlim={() => false} variant="rail" />
        <SidebarSettingsWidget
          isSlim={() => false}
          onSelect={openSettingsTab}
          variant="rail"
        />
      </div>
      <InviteModal />
    </div>
  );
};
