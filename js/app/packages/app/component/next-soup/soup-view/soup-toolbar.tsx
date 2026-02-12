import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import IconGear from '@macro-icons/macro-gear.svg';
import PreviewIcon from '@macro-icons/wide/preview.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import SignalIcon from '@macro-icons/wide/signal.svg';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';
import { useSettingsState } from '@core/constant/SettingsState';
import { TOKENS } from '@core/hotkey/tokens';
import {
  For,
  Show,
  createMemo,
  onCleanup,
  createSignal,
  type Component,
} from 'solid-js';
import {
  ANIMATED_ICONS,
  ENTITY_TYPE_FILTER_CONFIGS,
  type FilterID,
  getEntityTypeFilterIcon,
} from '@app/component/next-soup/filters/filters';
import { getIconConfig } from '@core/component/EntityIcon';
import { ENABLE_ANIMATED_ICONS } from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ValidHotkey } from '@core/hotkey/types';
import { IS_MAC } from '@core/constant/isMac';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { Dynamic } from 'solid-js/web';
import { SortDropdown } from '@app/component/next-soup/soup-view/sort-dropdown';
import { setCreateMenuOpen } from '@app/component/Launcher';
import { setKonsoleOpen } from '@app/component/command/state';

/**
 * Keyboard shortcuts for entity type filters.
 * This object is the single source of truth for filter shortcuts,
 * used by both the filter buttons and hotkey registrations.
 */
const ENTITY_TYPE_SHORTCUTS: Record<
  (typeof ENTITY_TYPE_FILTER_CONFIGS)[number]['id'],
  ValidHotkey
> = {
  document: 'd',
  canvas: 'n',
  image: 'g',
  code: 'k',
  video: 'v',
  task: 't',
  email: 'l',
  messages: 'm',
  agent: 'a',
  file: 'f',
  folder: 'r',
};

const SIDEBAR_ENTITY_FILTER_ORDER: FilterID[] = [
  'email',
  'document',
  'messages',
  'task',
  'agent',
  'canvas',
  'code',
  'image',
  'video',
  'file',
  'folder',
];

const runOnPress = (
  event: PointerEvent | KeyboardEvent,
  action: VoidFunction
) => {
  if (event instanceof PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    action();
    return;
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
};

export const SoupToolbar = () => {
  return (
    <>
      <SplitHeaderLeft>
        <div class="flex items-center h-full min-w-0 gap-1.5">
          <TopLeftActionButtons />
          <TopbarSoupControls />
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <div class="flex items-center h-full">
          <SettingsButton />
        </div>
      </SplitHeaderRight>

      <aside class="w-[130px] shrink-0 overflow-y-auto border-r border-edge-muted/50 bg-panel shadow-sm">
        <div class="flex h-full flex-col items-stretch p-0">
          <SoupFilters />
        </div>
      </aside>
    </>
  );
};

const SoupFilters = () => {
  const {
    soup,
    panel,
    isFilterMode,
    openFilterView,
    toggleFilterView,
    setSignalFilter,
    setNoiseFilter,
    openAllView,
    openInboxView,
    toggleAllView,
    toggleInboxView,
    isAllMode,
    isInboxMode,
    togglePreview,
  } = useSoupFilterActions();

  const entityTypeHotkeys = ENTITY_TYPE_FILTER_CONFIGS.map((filter) => ({
    hotkey: ENTITY_TYPE_SHORTCUTS[filter.id],
    description: `Filter by ${filter.label}`,
    handler: () => openFilterView(filter.id),
  }));
  const orderedEntityTypeFilters = createMemo(() => {
    const rank = new Map(
      SIDEBAR_ENTITY_FILTER_ORDER.map((id, index) => [id, index] as const)
    );
    return [...ENTITY_TYPE_FILTER_CONFIGS].sort((a, b) => {
      const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });
  });

  const hotkeyConfigs: {
    hotkey: ValidHotkey;
    description: string;
    handler: () => void;
  }[] = [
    {
      hotkey: 'i',
      description: 'Open Inbox (Signal)',
      handler: openInboxView,
    },
    {
      hotkey: 'o',
      description: 'Open Inbox (Noise)',
      handler: setNoiseFilter,
    },
    ...entityTypeHotkeys,
    {
      hotkey: 'u',
      description: 'Filter by Unread',
      handler: () => {
        if (!isInboxMode()) {
          openInboxView();
        }
        soup.filters.toggle('unread');
      },
    },
    {
      hotkey: '/',
      description: 'Open All',
      handler: openAllView,
    },
    {
      hotkey: 'space',
      description: 'Toggle preview',
      handler: () => {
        togglePreview();
      },
    },
  ];

  const hotkeyDisposers = hotkeyConfigs.map((config) =>
    registerHotkey({
      hotkey: [config.hotkey],
      scopeId: panel.splitHotkeyScope,
      description: config.description,
      keyDownHandler: () => {
        config.handler();
        return true;
      },
    })
  );

  onCleanup(() => {
    hotkeyDisposers.forEach((d) => d.dispose());
  });

  return (
    <div class="flex flex-col gap-0">
      <div class="flex flex-col gap-0 shrink-0">
        <FilterButton
          icon={SignalIcon}
          label="Inbox"
          shortcut="i"
          isActive={isInboxMode()}
          onClick={toggleInboxView}
        />
        <FilterButton
          icon={getEntityTypeFilterIcon('file').icon}
          label="All"
          shortcut="/"
          isActive={isAllMode()}
          onClick={toggleAllView}
        />
      </div>
      <FilterDivider />
      <div class="flex flex-col gap-0 shrink-0">
        <For each={orderedEntityTypeFilters()}>
          {(filter) => {
            const iconConfig = () =>
              filter.id === 'file'
                ? getIconConfig('pdf')
                : getEntityTypeFilterIcon(filter.id);
            const shortcut = ENTITY_TYPE_SHORTCUTS[filter.id];
            const animatedIcon = ANIMATED_ICONS[filter.id];

            return (
              <FilterButton
                icon={iconConfig().icon}
                animatedIcon={animatedIcon}
                label={filter.label ?? ''}
                shortcut={shortcut}
                isActive={() => isFilterMode(filter.id)}
                onClick={() => toggleFilterView(filter.id)}
              />
            );
          }}
        </For>
      </div>
    </div>
  );
};

const useSoupFilterActions = () => {
  const { soup, setSearchText, selectedSidebarTab, setSelectedSidebarTab } =
    useSoupView();
  const panel = useSplitPanelOrThrow();

  const focusSearchBar = () => {
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        '[data-soup-search-input]'
      );
      if (!input) return;
      input.focus();
      if (input.value) input.select();
    });
  };

  const openFilterView = (filter: FilterID) => {
    soup.filters.clear();
    soup.filters.activate(filter);
    setSearchText('');
    setSelectedSidebarTab(filter);
  };

  const goHomeView = () => {
    soup.filters.clear();
    setSearchText('');
    setSelectedSidebarTab('none');
  };

  const toggleFilterView = (filter: FilterID) => {
    if (isFilterMode(filter)) {
      goHomeView();
      return;
    }
    openFilterView(filter);
  };

  const setSignalFilter = () => {
    soup.filters.activate('signal');
    soup.filters.activate('not-done');
    setSelectedSidebarTab('inbox');
  };

  const setNoiseFilter = () => {
    soup.filters.activate('noise');
    soup.filters.activate('not-done');
    setSelectedSidebarTab('inbox');
  };

  const isInboxMode = () => selectedSidebarTab() === 'inbox';

  const isAllMode = () => selectedSidebarTab() === 'all';

  const isFilterMode = (filter: FilterID) => selectedSidebarTab() === filter;

  const openAllView = () => {
    soup.filters.clear();
    setSearchText('');
    setSelectedSidebarTab('all');
    focusSearchBar();
  };

  const toggleAllView = () => {
    if (isAllMode()) {
      goHomeView();
      return;
    }
    openAllView();
  };

  const openInboxView = () => {
    setSearchText('');
    setSignalFilter();
  };

  const toggleInboxView = () => {
    if (isInboxMode()) {
      goHomeView();
      return;
    }
    openInboxView();
  };

  const togglePreview = () => {
    const currentPreview = soup.previewEntity();
    if (currentPreview) {
      soup.setPreviewEntity(undefined);
      return;
    }
    const focused = soup.focus.id();
    if (!focused) return;
    soup.setPreviewEntity(focused);
  };

  return {
    soup,
    panel,
    openFilterView,
    toggleFilterView,
    isFilterMode,
    setSignalFilter,
    setNoiseFilter,
    openAllView,
    openInboxView,
    toggleAllView,
    toggleInboxView,
    isInboxMode,
    isAllMode,
    togglePreview,
  };
};

const UnreadDotIcon: Component<{ class?: string }> = (props) => (
  <svg
    class={props.class}
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="12" cy="12" r="4.5" />
  </svg>
);

const AllIcon: Component<{ class?: string }> = (props) => (
  <svg
    class={props.class}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M4 7.5H20M4 12H20M4 16.5H20"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
  </svg>
);

const TopbarFilterPill: Component<{
  label: string;
  shortcut: string;
  icon?: Component<{ class?: string }>;
  isActive: boolean;
  onPress: VoidFunction;
  disabled?: boolean;
}> = (props) => (
  <button
    type="button"
    disabled={props.disabled}
    class="h-full px-2.5 rounded-none shrink-0 flex items-center gap-1.5 active:bg-accent active:text-panel"
    classList={{
      'bg-accent text-panel': props.isActive,
      'text-ink-muted hover:text-accent hover:bg-accent/20': !props.isActive,
      'opacity-50 pointer-events-none': !!props.disabled,
    }}
    onPointerDown={(e) => runOnPress(e, props.onPress)}
    onKeyDown={(e) => runOnPress(e, props.onPress)}
  >
    <Show when={props.icon}>
      {(Icon) => <Dynamic component={Icon()} class="size-4" />}
    </Show>
    <span class="leading-none text-[11px]">
      <ShortcutLabel label={props.label} shortcut={props.shortcut} />
    </span>
  </button>
);

const TopbarSoupControls = () => {
  const {
    soup,
    panel,
    setSignalFilter,
    setNoiseFilter,
    isInboxMode,
    togglePreview,
  } =
    useSoupFilterActions();
  const [sortDropdownOpen, setSortDropdownOpen] = createSignal(false);

  const sortHotkeyDisposer = registerHotkey({
    hotkey: ['s'],
    scopeId: panel.splitHotkeyScope,
    description: 'Open sort menu',
    keyDownHandler: () => {
      setSortDropdownOpen((prev) => !prev);
      return true;
    },
  });
  onCleanup(sortHotkeyDisposer.dispose);

  return (
    <div class="flex items-stretch h-full gap-0 min-w-0 overflow-x-auto scrollbar-hidden">
      <Show
        when={isInboxMode()}
        fallback={<SearchBar />}
      >
        <>
          <TopbarFilterPill
            label="Signal"
            shortcut="i"
            icon={SignalIcon}
            isActive={soup.filters.isActive('signal')}
            onPress={setSignalFilter}
          />
          <TopbarFilterPill
            label="Noise"
            shortcut="o"
            icon={NoiseIcon}
            isActive={soup.filters.isActive('noise')}
            onPress={setNoiseFilter}
          />
          <TopbarFilterPill
            label="Unread"
            shortcut="u"
            icon={UnreadDotIcon}
            isActive={soup.filters.isActive('unread')}
            onPress={() => soup.filters.toggle('unread')}
          />
          <SortDropdown
            open={sortDropdownOpen}
            onOpenChange={setSortDropdownOpen}
            value={() => soup.sort.active()[0].id as SystemSortOption}
            onChange={(value) => {
              soup.sort.setAll([value]);
            }}
            layout="horizontal"
          />
          <TopbarFilterPill
            label="Preview"
            shortcut="space"
            icon={PreviewIcon}
            isActive={!!soup.previewEntity()}
            onPress={togglePreview}
            disabled={!soup.focus.id()}
          />
        </>
      </Show>
    </div>
  );
};

function SettingsButton() {
  const { settingsOpen, toggleSettings } = useSettingsState();
  const { getSplitCount } = useSplitLayout();

  // Hide settings button when there are multiple splits
  const isSingleSplit = () => getSplitCount() <= 1;

  return (
    <Show when={isSingleSplit()}>
      <Tooltip
        tooltip={
          <LabelAndHotKey
            label={settingsOpen() ? 'Close Settings' : 'Open Settings'}
            hotkeyToken={TOKENS.global.toggleSettings}
          />
        }
      >
        <button
          type="button"
          class="relative flex items-center justify-center size-[22px] rounded-full active:bg-accent active:text-panel"
          classList={{
            'bg-hover text-ink': settingsOpen(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !settingsOpen(),
          }}
          onClick={() => toggleSettings()}
        >
          <IconGear class="size-4.5" />
        </button>
      </Tooltip>
    </Show>
  );
}

function TopLeftActionButtons() {
  return (
    <div class="w-[130px] h-full shrink-0 flex border-r border-edge-muted/50">
      <CreateButton />
      <CommandMenuButton />
    </div>
  );
}

function CreateButton() {
  return (
    <button
      type="button"
      title="Create"
      class="group relative flex items-center justify-center w-1/2 h-full rounded-none text-ink-muted hover:text-accent hover:bg-accent/20 active:bg-accent active:text-panel transition-colors border-r border-edge-muted/50"
      onClick={() => setCreateMenuOpen(true)}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="size-4"
        aria-hidden="true"
      >
        <path
          d="M10.5 4V10.5H0V13.5H10.5V20H13.5V13.5H24V10.5H13.5V4H10.5Z"
          fill="currentColor"
        />
      </svg>
      <span class="absolute bottom-1 right-1 text-[9px] font-mono leading-none text-ink/70 group-hover:text-accent/80 group-active:text-panel/80">
        c
      </span>
    </button>
  );
}

function CommandMenuButton() {
  return (
    <button
      type="button"
      title="Command Menu"
      class="group relative flex items-center justify-center w-1/2 h-full rounded-none text-ink-muted hover:text-accent hover:bg-accent/20 active:bg-accent active:text-panel transition-colors"
      onClick={() => setKonsoleOpen(true)}
    >
      <span class="text-base leading-none">⌘</span>
      <span class="absolute bottom-1 right-1 text-[9px] font-mono leading-none text-ink/70 group-hover:text-accent/80 group-active:text-panel/80">
        k
      </span>
    </button>
  );
}

const SearchBar = () => {
  const { searchText, setSearchText } = useSoupView();
  const panel = useSplitPanelOrThrow();

  const [ref, setRef] = createSignal<HTMLInputElement | undefined>();

  const [searchFocused, setSearchFocused] = createSignal(false);

  const searchHotkey = registerHotkey({
    hotkey: ['cmd+f'],
    scopeId: panel.splitHotkeyScope,
    description: 'Search',
    keyDownHandler: () => {
      ref()?.focus();
      if (ref()?.value) ref()?.select();
      return true;
    },
  });

  onCleanup(searchHotkey.dispose);

  return (
    <div class="flex items-center shrink-0">
      <Tooltip tooltip={<LabelAndHotKey label="Filter" shortcut="⌘F" />}>
        <div
          class="relative flex items-center gap-1.5 h-full px-2.5 rounded-none touch:mobile-width:min-w-35 active:bg-accent active:text-panel"
          classList={{
            'bg-accent text-panel': !!searchText() && !searchFocused(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !searchText() || searchFocused(),
          }}
          onClick={() => ref()?.focus()}
        >
          <SearchIcon class="size-4.5 shrink-0" />
          <Show when={!searchText() && !searchFocused()}>
            <span class="leading-none pointer-events-none">
              <span class="underline underline-offset-2 decoration-current/60">
                {IS_MAC ? '⌘' : '^'}F
              </span>
              <span>ilter</span>
            </span>
          </Show>
          <input
            ref={setRef}
            data-soup-search-input
            type="text"
            value={searchText()}
            onInput={(e) => setSearchText(e.currentTarget.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(e) => {
              if (
                e.key === 'Escape' ||
                e.key === 'Enter' ||
                e.key === 'ArrowDown'
              ) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            class="p-0 bg-transparent border-none outline-none ring-0 focus:outline-none focus:ring-0 cursor-default"
            style={{
              width:
                !searchText() && !searchFocused()
                  ? '0'
                  : `${Math.max(5, searchText().length + 1)}ch`,
            }}
          />
        </div>
      </Tooltip>
    </div>
  );
};

const SHORTCUT_SUFFIXES: Record<string, string> = { space: '␣', '/': '/' };

export const ShortcutLabel: Component<{ label: string; shortcut: string }> = (
  props
) => {
  const s = props.shortcut.trim();
  if (!s) return <>{props.label}</>;

  const idx = props.label.toLowerCase().indexOf(s.toLowerCase());
  if (idx === -1) return <>{props.label}</>;

  return (
    <>
      {props.label.slice(0, idx)}
      <span class="underline underline-offset-3 decoration-2 decoration-current">
        {props.label.slice(idx, idx + s.length)}
      </span>
      {props.label.slice(idx + s.length)}
    </>
  );
};

export interface FilterButtonProps {
  icon: Component<{ class?: string }>;
  animatedIcon?: Component<{ triggerAnimation?: boolean }>;
  label: string;
  shortcut: string;
  isActive: (() => boolean) | boolean;
  onClick: () => void;
}

export const FilterButton: Component<FilterButtonProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const isActive = () =>
    typeof props.isActive === 'function' ? props.isActive() : props.isActive;
  const shortcutDisplay = () => {
    const s = props.shortcut.trim();
    if (!s) return '';
    return SHORTCUT_SUFFIXES[s.toLowerCase()] ?? s;
  };

  return (
    <div class="shrink-0">
      <button
        type="button"
        class="w-full h-9 flex items-center justify-between px-3 active:bg-accent active:text-panel rounded-none"
        title={props.label}
        classList={{
          'bg-accent text-panel': isActive(),
          'text-ink-muted hover:text-accent hover:bg-accent/20': !isActive(),
        }}
        onPointerDown={(e) => runOnPress(e, props.onClick)}
        onKeyDown={(e) => runOnPress(e, props.onClick)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div class="min-w-0 flex items-center gap-3 mr-2">
          <Show
            when={ENABLE_ANIMATED_ICONS && props.animatedIcon}
            fallback={<Dynamic component={props.icon} class="size-4" />}
          >
            {(Icon) => (
              <div class="size-4 shrink-0 overflow-visible">
                <Dynamic
                  component={Icon()}
                  triggerAnimation={isHovered() || isActive()}
                />
              </div>
            )}
          </Show>
          <span
            class="min-w-0 overflow-hidden whitespace-nowrap text-xs leading-none"
            classList={{
              'text-panel': isActive(),
              'text-ink': !isActive(),
            }}
          >
            <ShortcutLabel label={props.label} shortcut={props.shortcut} />
          </span>
        </div>
        <Show when={shortcutDisplay()}>
          <span
            class="shrink-0 font-mono text-[10px] leading-none opacity-90"
            classList={{
              'text-panel/90': isActive(),
              'text-ink/80': !isActive(),
            }}
          >
            {shortcutDisplay()}
          </span>
        </Show>
      </button>
    </div>
  );
};

export const FilterDivider: Component = () => (
  <hr class="w-full border-0 border-t border-edge-muted/50 m-0 shrink-0" />
);
