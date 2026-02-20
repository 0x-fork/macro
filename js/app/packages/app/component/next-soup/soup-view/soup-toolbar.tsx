import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import IconGear from '@macro-icons/macro-gear.svg';
import PreviewIcon from '@macro-icons/wide/preview.svg';
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
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ValidHotkey } from '@core/hotkey/types';
import { IS_MAC } from '@core/constant/isMac';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { Dynamic } from 'solid-js/web';
import { SortDropdown } from '@app/component/next-soup/soup-view/sort-dropdown';
import { setCreateMenuOpen } from '@app/component/Launcher';
import {
  ENTITY_TYPE_FILTER_CONFIGS,
  type FilterID,
  getEntityTypeFilterIcon,
} from '@app/component/next-soup/filters/filters';
import { getIconConfig } from '@core/component/EntityIcon';

export const SOUP_SIDEBAR_WIDTH_CLASS = 'w-[280px]';

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
  'document',
  'file',
  'messages',
  'task',
  'agent',
  'image',
  'email',
];

const SIDEBAR_LABEL_OVERRIDES: Partial<Record<FilterID, string>> = {
  document: 'Docs',
  image: 'Media',
  file: 'Files',
  messages: 'Msgs',
};

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
        <div class="flex items-center h-full min-w-0 gap-0">
          <TopLeftActionButtons />
          <TopbarSoupControls />
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <div class="flex items-center h-full">
          <SettingsButton />
        </div>
      </SplitHeaderRight>
    </>
  );
};

export const SoupSidebarFilters = () => {
  return (
    <div class="flex h-full flex-col items-stretch p-0">
      <div class="shrink-0 p-1 border-b border-edge-muted/50">
        <SearchBar />
      </div>
      <SoupFilters />
    </div>
  );
};

const SoupFilters = () => {
  const {
    panel,
    openInboxView,
    openFilterView,
    isInboxMode,
    isFilterMode,
    togglePreview,
  } = useSoupFilterActions();

  const orderedEntityTypeFilters = createMemo(() => {
    const rank = new Map(
      SIDEBAR_ENTITY_FILTER_ORDER.map((id, index) => [id, index] as const)
    );
    return [...ENTITY_TYPE_FILTER_CONFIGS]
      .filter((f) => rank.has(f.id))
      .sort((a, b) => {
        const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aRank - bRank;
      });
  });

  const entityTypeHotkeys = orderedEntityTypeFilters().map((filter) => ({
    hotkey: ENTITY_TYPE_SHORTCUTS[filter.id],
    description: `Open ${SIDEBAR_LABEL_OVERRIDES[filter.id] ?? filter.label}`,
    handler: () => openFilterView(filter.id),
  }));

  const hotkeyConfigs: {
    hotkey: ValidHotkey;
    description: string;
    handler: () => void;
  }[] = [
    {
      hotkey: 'i',
      description: 'Open Inbox',
      handler: openInboxView,
    },
    ...entityTypeHotkeys,
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
    <div class="flex flex-row items-center gap-0.5 p-1 overflow-x-auto scrollbar-hidden">
      <FilterButton
        icon={SignalIcon}
        label="Inbox"
        shortcut="i"
        isActive={isInboxMode()}
        onClick={openInboxView}
      />
      <For each={orderedEntityTypeFilters()}>
        {(filter) => {
          const iconConfig = () =>
            filter.id === 'file'
              ? getIconConfig('pdf')
              : getEntityTypeFilterIcon(filter.id);
          const shortcut = ENTITY_TYPE_SHORTCUTS[filter.id];

          return (
            <FilterButton
              icon={iconConfig().icon}
              label={SIDEBAR_LABEL_OVERRIDES[filter.id] ?? (filter.label ?? '')}
              shortcut={shortcut}
              isActive={() => isFilterMode(filter.id)}
              onClick={() => openFilterView(filter.id)}
            />
          );
        }}
      </For>
    </div>
  );
};

const useSoupFilterActions = () => {
  const {
    soup,
    setSearchText,
    setEmailView,
    selectedSidebarTab,
    setSelectedSidebarTab,
  } = useSoupView();
  const panel = useSplitPanelOrThrow();

  const normalizeSidebarTabForFilter = (
    filter: FilterID
  ): 'none' | 'all' | 'inbox' | FilterID => {
    if (filter === 'canvas') return 'document';
    if (filter === 'video') return 'image';
    if (filter === 'folder' || filter === 'code') return 'file';
    return filter;
  };

  const openFilterView = (filter: FilterID) => {
    soup.filters.clear();
    soup.filters.activate(filter);
    setSearchText('');
    if (filter !== 'email') {
      setEmailView('all');
    }
    setSelectedSidebarTab(normalizeSidebarTabForFilter(filter));
  };

  const openInboxView = () => {
    soup.filters.clear();
    soup.filters.activate('signal');
    soup.filters.activate('not-done');
    setSearchText('');
    setEmailView('all');
    setSelectedSidebarTab('inbox');
  };

  const isInboxMode = () => selectedSidebarTab() === 'inbox';
  const isFilterMode = (filter: FilterID) =>
    selectedSidebarTab() === normalizeSidebarTabForFilter(filter);

  const togglePreview = () => {
    const [isPreviewOpen, setPreviewOpen] = panel.previewState;
    if (isPreviewOpen()) {
      setPreviewOpen(false);
      soup.setPreviewEntity(undefined);
      return;
    }
    setPreviewOpen(true);
    const focused = soup.focus.id();
    soup.setPreviewEntity(focused);
  };

  return {
    soup,
    panel,
    openInboxView,
    openFilterView,
    isInboxMode,
    isFilterMode,
    togglePreview,
  };
};

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
    class="h-full px-2.5 rounded-none shrink-0 flex items-center gap-1.5 active:bg-hover active:text-ink"
    classList={{
      'bg-edge-muted/70 text-ink': props.isActive,
      'text-ink-muted hover:text-ink hover:bg-hover/70': !props.isActive,
      'font-medium': props.isActive,
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
  const { soup, panel, togglePreview } = useSoupFilterActions();
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
        isActive={panel.previewState[0]()}
        onPress={togglePreview}
      />
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
          class="relative flex items-center justify-center size-[22px] rounded-full active:bg-hover active:text-ink"
          classList={{
            'bg-edge-muted/70 text-ink': settingsOpen(),
            'text-ink-muted hover:text-ink hover:bg-hover/70':
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
    <div
      class={`${SOUP_SIDEBAR_WIDTH_CLASS} h-full shrink-0 flex border-r border-edge-muted/50`}
    >
      <CreateButton />
    </div>
  );
}

function CreateButton() {
  return (
    <button
      type="button"
      title="Create"
      class="group relative flex items-center justify-center w-full h-full rounded-none text-ink-muted hover:text-ink hover:bg-hover/70 active:bg-hover active:text-ink transition-colors"
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
      <span class="absolute bottom-1 right-1 text-[9px] font-mono leading-none text-ink/70 group-hover:text-ink/80 group-active:text-ink/80">
        c
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
    <div class="flex items-center shrink-0 w-full">
      <Tooltip tooltip={<LabelAndHotKey label="Filter" shortcut="⌘F" />}>
        <div
          class="relative flex items-center gap-1.5 h-8 w-full px-2.5 rounded-md active:bg-hover active:text-ink"
          classList={{
            'bg-edge-muted/70 text-ink': !!searchText() && !searchFocused(),
            'text-ink-muted hover:text-ink hover:bg-hover/70':
              !searchText() || searchFocused(),
          }}
          onClick={() => ref()?.focus()}
        >
          <SearchIcon class="size-4.5 shrink-0" />
          <Show when={!searchText() && !searchFocused()}>
            <span class="leading-none pointer-events-none text-[10px]">
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
  label: string;
  shortcut: string;
  isActive: (() => boolean) | boolean;
  onClick: () => void;
}

export const FilterButton: Component<FilterButtonProps> = (props) => {
  const isActive = () =>
    typeof props.isActive === 'function' ? props.isActive() : props.isActive;

  return (
    <div class="shrink-0">
      <button
        type="button"
        class="size-8 flex items-center justify-center active:bg-hover active:text-ink rounded-md"
        title={props.label}
        aria-label={props.label}
        classList={{
          'bg-edge-muted/70 text-ink': isActive(),
          'text-ink-muted hover:bg-hover/70 hover:text-ink': !isActive(),
        }}
        onPointerDown={(e) => runOnPress(e, props.onClick)}
        onKeyDown={(e) => runOnPress(e, props.onClick)}
      >
        <Dynamic component={props.icon} class="size-3.5 shrink-0" />
      </button>
    </div>
  );
};
