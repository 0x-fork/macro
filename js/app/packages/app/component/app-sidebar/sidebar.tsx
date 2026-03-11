import GearIcon from '@phosphor-icons/core/regular/gear.svg?component-solid';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { AnimatedStarIcon } from '@macro-icons/wide/animating/star';
import { AnimatedEmailIcon } from '@macro-icons/wide/animating/email';
import { AnimatedTaskIcon } from '@macro-icons/wide/animating/task';
import { AnimatedChannelIcon } from '@macro-icons/wide/animating/channel';
import { AnimatedFileMdIcon } from '@macro-icons/wide/animating/fileMd';
import { AnimatedFolderIcon } from '@macro-icons/wide/animating/folder';
import { AnimatedInboxIcon } from '@macro-icons/wide/animating/inbox';
import { AnimatedSidebarIcon } from '@macro-icons/wide/animating/sidebar';
import { useLocation } from '@solidjs/router';
import LogoIcon from '@macro-icons/macro-logo.svg';
import PlusIcon from '@phosphor-icons/core/bold/plus-bold.svg?component-solid';
import CommandIcon from '@phosphor-icons/core/assets/regular/command.svg';
import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import { LIST_VIEW_PATHS, type ListView } from '@app/constants/list-views';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { setCreateMenuOpen } from '@app/component/Launcher';
import { CommandState } from '@app/component/command';
import { cn } from '@ui/utils/classname';
import { Button } from '@app/component/next-soup/soup-view/filters-bar/button';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { ChannelsUnreadWidget } from '@app/component/app-sidebar/channels-unread-widget';
import { globalSplitManager } from '@app/signal/splitLayout';
import { isMobile } from '@core/mobile/isMobile';
import { useSettingsState } from '@core/constant/SettingsState';
import type { ValidHotkey } from '@core/hotkey/types';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { GO_TO_COMMAND_SCOPE, GO_TO_LEADER_KEY } from '@app/constants/hotkeys';
import { ROUTER_BASE } from '@app/constants/routerBase';
import { TOKENS } from '@core/hotkey/tokens';
import { CommandItem } from '@app/component/command/CommandItem';
import { getBlockNameForEntity } from '@app/component/command/CommandMenu';
import { setPendingSidebarSearchText } from '@app/component/command/sidebar-search';
import type { CategoryFilter } from '@app/component/command/types';
import {
  isCommandItem,
  isEntityItem,
  useCommandItems,
} from '@app/component/command/useCommandItems';
import { getActiveCommandsFromScope } from '@core/hotkey/getCommands';
import { runCommand } from '@core/hotkey/utils';

interface SidebarItem {
  id: ListView;
  label: string;
  href: string;
  icon?: Component<
    JSX.SvgSVGAttributes<SVGSVGElement> | { triggerAnimation?: boolean }
  >;
  hotkey: ValidHotkey;
  standaloneHotkey?: boolean;
}

export const SIDEBAR_LINKS = [
  {
    id: 'inbox',
    label: 'Inbox',
    href: LIST_VIEW_PATHS.inbox,
    icon: AnimatedInboxIcon,
    hotkey: 'i',
  },
  {
    id: 'agents',
    label: 'Agents',
    href: LIST_VIEW_PATHS.agents,
    icon: AnimatedStarIcon,
    hotkey: 'a',
  },
  {
    id: 'mail',
    label: 'Email',
    href: LIST_VIEW_PATHS.mail,
    icon: AnimatedEmailIcon,
    hotkey: 'e',
  },
  {
    id: 'documents',
    label: 'Documents',
    href: LIST_VIEW_PATHS.documents,
    icon: AnimatedFileMdIcon,
    hotkey: 'd',
  },
  {
    id: 'tasks',
    label: 'Tasks',
    href: LIST_VIEW_PATHS.tasks,
    icon: AnimatedTaskIcon,
    hotkey: 't',
  },
  {
    id: 'channels',
    label: 'Channels',
    href: LIST_VIEW_PATHS.channels,
    icon: AnimatedChannelIcon,
    hotkey: 'c',
  },
  {
    id: 'files',
    label: 'Files',
    href: LIST_VIEW_PATHS.files,
    icon: AnimatedFolderIcon,
    hotkey: 'f',
  },
] satisfies SidebarItem[];

export type SidebarState = 'hidden' | 'expanded' | 'slim';

type AppSidebarProps = {
  sidebarState?: SidebarState;
  onOpenChange: (open: boolean) => void;
};

export const AppSidebar = (props: AppSidebarProps) => {
  const layout = useSplitLayout();
  const { toggleSettings } = useSettingsState();

  const handleCommandPaletteClick = () => {
    CommandState.toggle();
  };

  const handleCreateClick = () => {
    setCreateMenuOpen((p) => !p);
  };

  const registerHotkeys = () => {
    // Register 'g' as a leader key that activates the global GO_TO command scope
    registerHotkey({
      hotkey: GO_TO_LEADER_KEY,
      scopeId: 'global',
      description: 'Go to page',
      keyDownHandler: () => false,
      activateCommandScopeId: GO_TO_COMMAND_SCOPE,
      hide: true,
      registrationType: 'add',
    });

    registerHotkey({
      hotkey: 'cmd+b',
      scopeId: 'global',
      hotkeyToken: TOKENS.global.toggleSidebar,
      description: 'Toggle sidebar',
      keyDownHandler: (e) => {
        e?.preventDefault();
        props.onOpenChange(isSlim());
        return true;
      },
    });

    // Register navigation shortcuts in the global GO_TO command scope
    for (const link of SIDEBAR_LINKS) {
      registerHotkey({
        hotkey: link.hotkey,
        scopeId: link.standaloneHotkey ? 'global' : GO_TO_COMMAND_SCOPE,
        description: `Go to ${link.label}`,
        keyDownHandler: (e) => {
          e?.preventDefault();
          layout.openWithSplit(
            {
              type: 'component',
              id: link.id,
            },
            {
              preferNewSplit: e?.shiftKey,
              mergeHistory: true,
              allowDuplicate: true,
            }
          );
          return true;
        },
      });
    }

    registerHotkey({
      hotkey: '/',
      scopeId: 'global',
      description: 'Focus sidebar search',
      keyDownHandler: (e) => {
        e?.preventDefault();
        searchInputRef()?.focus();
        return true;
      },
    });
  };

  registerHotkeys();

  const isExpanded = () => props.sidebarState === 'expanded';
  const isSlim = () => props.sidebarState === 'slim';
  const [sidebarBtnHovering, setSidebarBtnHovering] = createSignal(false);
  const [searchInputRef, setSearchInputRef] = createSignal<HTMLInputElement>();
  const [searchQuery, setSearchQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(-1);
  const [categoryFilter] = createSignal<CategoryFilter>('all');
  const filteredItems = useCommandItems(searchQuery, categoryFilter);

  const shouldShowResults = createMemo(
    () => isExpanded() && searchQuery().trim().length > 0
  );

  const selectedItem = createMemo(() => {
    const index = selectedIndex();
    if (index < 0) return undefined;
    return filteredItems()[index];
  });

  createEffect(() => {
    const items = filteredItems();
    const index = selectedIndex();
    if (index >= items.length) {
      setSelectedIndex(items.length > 0 ? 0 : -1);
    }
  });

  const openSearchView = () => {
    const query = searchQuery().trim();
    if (query.length === 0) return;
    setPendingSidebarSearchText(query);
    layout.openWithSplit(
      {
        type: 'component',
        id: 'search',
      },
      {
        mergeHistory: true,
        allowDuplicate: true,
      }
    );
    setSearchQuery('');
    setSelectedIndex(-1);
  };

  const handleItemAction = (openInNewSplit = false) => {
    const item = selectedItem();
    if (!item) {
      openSearchView();
      return;
    }

    if (isCommandItem(item)) {
      const command = item.data;
      if (command.activateCommandScopeId) {
        const nestedCommands = getActiveCommandsFromScope(
          command.activateCommandScopeId,
          {
            sortByScopeLevel: false,
            hideShadowedCommands: false,
            hideCommandsWithoutHotkeys: false,
            limitToCurrentScope: true,
          }
        );
        CommandState.setQuery('');
        CommandState.setCommandScopeCommands(nestedCommands);
        CommandState.setSelectedIndex(0);
        CommandState.open();
      } else {
        runCommand(command);
      }
      setSearchQuery('');
      setSelectedIndex(-1);
      return;
    }

    if (isEntityItem(item)) {
      const blockName = getBlockNameForEntity(item);
      if (blockName) {
        layout.openWithSplit(
          { type: blockName, id: item.id },
          {
            referredFrom: 'kommand-menu',
            preferNewSplit: openInNewSplit,
          }
        );
      }
      setSearchQuery('');
      setSelectedIndex(-1);
    }
  };

  return (
    <>
      <Show when={isMobile() && isExpanded()}>
        <div
          class="absolute z-modal-overlay pattern-panel pattern-diagonal-4 w-screen h-full inset-0 mask-l-from-0 pointer-events-[all] transition-opacity opacity-100"
          onClick={() => props.onOpenChange(false)}
        />
      </Show>
      <div
        class={cn(
          'group/sidebar h-full py-2 flex flex-col gap-4 mobile:absolute mobile:z-modal-content ease-in-out',
          isExpanded() &&
            'max-w-56 w-full mobile:max-w-2/3 translate-x-0 opacity-100',
          props.sidebarState === 'hidden' &&
            '-translate-x-full overflow-hidden opacity-0',

          isSlim() &&
            'max-w-12 w-full mobile:max-w-2/3 translate-x-0 opacity-100'
        )}
        data-expanded={isExpanded()}
        data-slim={isSlim()}
        style={{
          'transition-property': 'transform, max-width, opacity',
          'transition-duration': '100ms',
        }}
      >
        <div
          class={cn(
            'flex items-center justify-between py-2 pl-3 pr-2',
            isSlim() && 'flex-col px-2 pb-0 justify-center'
          )}
        >
          <LogoIcon class="size-6 text-accent opacity-100 group-data-[slim=true]/sidebar:opacity-0 group-data-[slim=true]/sidebar:size-0" />
          <div class="flex items-center gap-1">
            <Show when={isExpanded()}>
              <Tooltip tooltip={<LabelAndHotKey label="Create new" shortcut="c" />}>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  class="rounded-xs"
                  onClick={handleCreateClick}
                >
                  <PlusIcon class="size-4" />
                </Button>
              </Tooltip>
              <Tooltip
                tooltip={
                  <LabelAndHotKey
                    label="Command palette"
                    hotkeyToken={TOKENS.global.commandMenu}
                  />
                }
              >
                <Button
                  variant="secondary"
                  size="icon-sm"
                  class="rounded-xs"
                  onClick={handleCommandPaletteClick}
                >
                  <CommandIcon />
                </Button>
              </Tooltip>
            </Show>
            <Show when={!isMobile()}>
              {/*<Tooltip tooltip={isSlim() ? 'Expand sidebar' : 'Shrink sidebar'}>*/}
              <Tooltip
                tooltip={
                  <LabelAndHotKey
                    label={isSlim() ? 'Expand sidebar' : 'Shrink sidebar'}
                    hotkeyToken={TOKENS.global.toggleSidebar}
                  />
                }
              >
                <Button
                  variant="secondary"
                  size="icon-sm"
                  class="rounded-xs [&_svg]:size-4"
                  onClick={() => props.onOpenChange(isSlim())}
                  onMouseEnter={() => setSidebarBtnHovering(true)}
                  onMouseLeave={() => setSidebarBtnHovering(false)}
                >
                  <AnimatedSidebarIcon
                    triggerAnimation={sidebarBtnHovering()}
                  />
                </Button>
              </Tooltip>
            </Show>
          </div>
        </div>

        <Show when={isExpanded()}>
          <div class="px-2">
            <div class="relative flex items-center gap-2 rounded-xs border border-edge-muted bg-transparent px-2 py-1.5 text-sm">
              <SearchIcon class="size-4 shrink-0 text-ink-muted" />
              <input
                ref={setSearchInputRef}
                type="text"
                value={searchQuery()}
                onInput={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  setSelectedIndex(-1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    const items = filteredItems();
                    if (items.length === 0) return;
                    setSelectedIndex((prev) =>
                      prev < 0 ? 0 : Math.min(prev + 1, items.length - 1)
                    );
                  }

                  if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    const items = filteredItems();
                    if (items.length === 0) return;
                    setSelectedIndex((prev) =>
                      prev <= 0 ? 0 : Math.max(prev - 1, 0)
                    );
                  }

                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleItemAction(e.shiftKey);
                  }

                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchQuery('');
                    setSelectedIndex(-1);
                  }
                }}
                class="w-full bg-transparent p-0 text-sm text-ink outline-none placeholder:text-ink-muted"
                placeholder="Search everything (/)"
              />
            </div>

            <Show when={shouldShowResults()}>
              <div class="mt-1 overflow-hidden rounded-xs border border-edge-muted bg-bg-panel max-h-80">
                <For each={filteredItems().slice(0, 8)}>
                  {(item, index) => (
                    <CommandItem
                      item={item}
                      index={index()}
                      selected={selectedIndex() === index()}
                      onHover={setSelectedIndex}
                      onSelect={(_, openInNewSplit) => {
                        setSelectedIndex(index());
                        handleItemAction(openInNewSplit);
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        <nav>
          <ul class="w-full h-full px-2 flex flex-col gap-1">
            <For each={SIDEBAR_LINKS}>
              {(link) => (
                <li class="flex items-center justify-center">
                  <SidebarLink
                    {...link}
                    sidebarState={props.sidebarState ?? 'expanded'}
                  />
                </li>
              )}
            </For>
          </ul>
        </nav>

        <Show when={isExpanded()}>
          <div class="block max-h-[clamp(10%,60%,20rem)]">
            <ChannelsUnreadWidget />
          </div>

          {/* <div class="block max-h-[clamp(10%,60%,20rem)] mt-auto"> */}
          {/*   <UnreadNotificationsWidget /> */}
          {/* </div> */}
        </Show>

        <div class="mt-auto w-full px-2">
          {/*<Button
            class={cn(
              'flex items-center justify-start text-sm gap-2 cursor-default',
              isSlim() ? 'justify-center aspect-square' : 'w-full'
            )}
            variant="ghost"
            size={isSlim() ? 'icon-sm' : 'sm'}
            onClick={() => openSettings('Shortcuts')}
          >
            <KeyboardIcon class="size-4 shrink-0" />
            <span class={cn(isSlim() ? 'sr-only' : 'block')}>Shortcuts</span>
          </Button>*/}

          <Tooltip
            class="w-full"
            tooltip={
              <LabelAndHotKey
                label="Settings"
                hotkeyToken="global.toggleSettings"
              />
            }
          >
            <Button
              class={cn(
                'flex items-center justify-start text-sm gap-2 cursor-default',
                isSlim() ? 'justify-center aspect-square' : 'w-full'
              )}
              variant="ghost"
              size={isSlim() ? 'icon-sm' : 'sm'}
              onClick={toggleSettings}
            >
              <GearIcon class="size-4 shrink-0" />
              <span class={cn(isSlim() ? 'sr-only' : 'block')}>Settings</span>
            </Button>
          </Tooltip>
        </div>
      </div>
    </>
  );
};

interface SidebarLinkProps extends SidebarItem {
  sidebarState: SidebarState;
}

const SidebarLink = (props: SidebarLinkProps) => {
  const [isHovering, setIsHovering] = createSignal(false);

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

  return (
    <Button
      as="a"
      variant="ghost"
      size={props.sidebarState === 'slim' ? 'icon-sm' : 'sm'}
      class={cn(
        'flex items-center justify-start text-sm gap-2 cursor-default rounded-xs',
        isActive() && 'bg-ink/7 not-disabled:hover:bg-ink/15 text-ink',
        props.sidebarState === 'slim' && 'size-8 justify-center aspect-square',
        props.sidebarState !== 'slim' && 'w-full'
      )}
      href={`${ROUTER_BASE}/component${props.href}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={(e) => {
        // Middle mouse handling
        if (e.button === 1) return;

        e.preventDefault();
        layout.openWithSplit(
          {
            type: 'component',
            id: props.id,
          },
          {
            preferNewSplit: e.shiftKey,
            mergeHistory: true,
            allowDuplicate: true,
          }
        );
      }}
    >
      <Show when={props.icon}>
        <div class="shrink-0 [&_svg]:size-4">
          <Dynamic component={props.icon} triggerAnimation={isHovering()} />
        </div>
      </Show>
      <span class="opacity-100 group-data-[slim=true]/sidebar:sr-only group-data-[slim=true]/sidebar:opacity-0">
        {props.label}
      </span>
    </Button>
  );
};
