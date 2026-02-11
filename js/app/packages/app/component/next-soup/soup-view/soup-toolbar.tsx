import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import IconGear from '@macro-icons/macro-gear.svg';
import XIcon from '@icon/regular/x.svg?component-solid';
import PreviewIcon from '@macro-icons/wide/preview.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import SignalIcon from '@macro-icons/wide/signal.svg';
import { AnimatedNoiseIcon } from '@macro-icons/wide/animating/noise';
import { AnimatedSignalIcon } from '@macro-icons/wide/animating/signal';
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
import { ENABLE_ANIMATED_ICONS } from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ValidHotkey } from '@core/hotkey/types';
import { IS_MAC } from '@core/constant/isMac';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { Dynamic } from 'solid-js/web';
import { SortDropdown } from '@app/component/next-soup/soup-view/sort-dropdown';

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
  task: 't',
  email: 'l',
  people: 'p',
  teams: 'm',
  agent: 'a',
  file: 'f',
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
        <div class="flex items-center h-full">
          <SearchBar />
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <div class="flex items-center h-full">
          <SettingsButton />
        </div>
      </SplitHeaderRight>

      <aside class="w-14 shrink-0 border-r border-edge-muted/50 bg-menu overflow-y-auto">
        <div class="flex flex-col items-stretch p-0">
          <SoupFilters />
        </div>
      </aside>
    </>
  );
};

const SoupFilters = () => {
  const { soup, setSearchText } = useSoupView();
  const panel = useSplitPanelOrThrow();

  const [sortDropdownOpen, setSortDropdownOpen] = createSignal(false);

  const toggleFilter = (filter: FilterID) => {
    soup.filters.toggle(filter);
  };

  const toggleSignalFilter = () => {
    // If we're going to be removing the signal filter,
    // we should replace it with the explicit-noise filter
    if (soup.filters.isActive('signal')) {
      toggleFilter('explicit-noise');
      soup.filters.deactivate('not-done');
    } else {
      toggleFilter('signal');
      soup.filters.activate('not-done');
    }
  };

  const toggleNoiseFilter = () => {
    // If we're going to be removing the noise filter,
    // we should replace it with the explicit-noise filter
    if (soup.filters.isActive('noise')) {
      toggleFilter('explicit-noise');
      soup.filters.deactivate('not-done');
    } else {
      toggleFilter('noise');
      soup.filters.activate('not-done');
    }
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

  const hotkeyConfigs: {
    hotkey: ValidHotkey;
    description: string;
    handler: () => void;
  }[] = [
    {
      hotkey: 'i',
      description: 'Toggle Inbox',
      handler: toggleSignalFilter,
    },
    {
      hotkey: 'o',
      description: 'Toggle Other',
      handler: toggleNoiseFilter,
    },
    // Entity type filter hotkeys
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.document,
      description: 'Filter by Docs',
      handler: () => toggleFilter('document'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.task,
      description: 'Filter by Tasks',
      handler: () => toggleFilter('task'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.email,
      description: 'Filter by Mail',
      handler: () => toggleFilter('email'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.people,
      description: 'Filter by People',
      handler: () => toggleFilter('people'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.teams,
      description: 'Filter by Teams',
      handler: () => toggleFilter('teams'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.agent,
      description: 'Filter by Agents',
      handler: () => toggleFilter('agent'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.file,
      description: 'Filter by Files',
      handler: () => toggleFilter('file'),
    },
    {
      hotkey: 'u',
      description: 'Filter by Unread',
      handler: () => toggleFilter('unread'),
    },
    {
      hotkey: 's',
      description: 'Open sort menu',
      handler: () => setSortDropdownOpen((prev) => !prev),
    },
    {
      hotkey: '/',
      description: 'Clear filters',
      handler: () => {
        soup.filters.clear();
        setSearchText('');
      },
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
      {/* Inbox toggle */}
      <FilterButton
        icon={SignalIcon}
        animatedIcon={AnimatedSignalIcon}
        label="Inbox"
        shortcut="i"
        isActive={soup.filters.isActive('signal')}
        onClick={toggleSignalFilter}
      />
      {/* Other toggle */}
      <FilterButton
        icon={NoiseIcon}
        animatedIcon={AnimatedNoiseIcon}
        label="Other"
        shortcut="o"
        isActive={soup.filters.isActive('noise')}
        onClick={toggleNoiseFilter}
      />
      <FilterDivider />
      {/* Unread filter */}
      <div class="shrink-0">
        <button
          type="button"
          class="w-full flex flex-col items-center justify-center gap-2 px-2 py-2 active:bg-accent active:text-panel rounded-none"
          classList={{
            'bg-accent text-panel': soup.filters.isActive('unread'),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !soup.filters.isActive('unread'),
          }}
          onPointerDown={(e) => runOnPress(e, () => soup.filters.toggle('unread'))}
          onKeyDown={(e) => runOnPress(e, () => soup.filters.toggle('unread'))}
        >
          <svg
            class="size-4"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="4.5" />
          </svg>
          <span
            class="leading-none text-[6pt] text-center"
            classList={{
              'text-panel': soup.filters.isActive('unread'),
              'text-ink': !soup.filters.isActive('unread'),
            }}
          >
            <ShortcutLabel label="Unread" shortcut="u" />
          </span>
        </button>
      </div>
      <FilterDivider />
      {/* Entity type icons */}
      <div class="flex flex-col gap-0 shrink-0">
        <For each={ENTITY_TYPE_FILTER_CONFIGS}>
          {(filter) => {
            const iconConfig = () => getEntityTypeFilterIcon(filter.id);
            const shortcut = ENTITY_TYPE_SHORTCUTS[filter.id];
            const animatedIcon = ANIMATED_ICONS[filter.id];

            return (
              <FilterButton
                icon={iconConfig().icon}
                animatedIcon={animatedIcon}
                label={filter.label ?? ''}
                shortcut={shortcut}
                isActive={() => soup.filters.isActive(filter.id)}
                onClick={() => toggleFilter(filter.id)}
              />
            );
          }}
        </For>
      </div>
      <FilterDivider />
      {/* Preview toggle */}
      <button
        type="button"
        class="w-full flex flex-col items-center justify-center gap-2 px-2 py-2 active:bg-accent active:text-panel rounded-none"
        classList={{
          'bg-accent text-panel': !!soup.previewEntity(),
          'text-ink-muted hover:text-accent hover:bg-accent/20':
            !soup.previewEntity(),
        }}
        disabled={!soup.focus.id()}
        onPointerDown={(e) => runOnPress(e, togglePreview)}
        onKeyDown={(e) => runOnPress(e, togglePreview)}
      >
        <PreviewIcon class="size-4" />
        <span
          class="leading-none text-[6pt] text-center"
          classList={{
            'text-panel': !!soup.previewEntity(),
            'text-ink': !soup.previewEntity(),
          }}
        >
          <ShortcutLabel label="Preview" shortcut="space" />
        </span>
      </button>
      <FilterDivider />
      {/* Sort dropdown */}
      <SortDropdown
        open={sortDropdownOpen}
        onOpenChange={setSortDropdownOpen}
        value={() => soup.sort.active()[0].id as SystemSortOption}
        onChange={(value) => {
          soup.sort.setAll([value]);
        }}
        layout="vertical"
      />
      <FilterDivider />
      <div class="shrink-0">
        <button
          type="button"
          class="w-full flex flex-col items-center justify-center gap-2 px-2 py-2 rounded-none active:bg-accent active:text-panel text-ink-muted hover:text-accent hover:bg-accent/20"
          onPointerDown={(e) =>
            runOnPress(e, () => {
              soup.filters.clear();
              setSearchText('');
            })
          }
          onKeyDown={(e) =>
            runOnPress(e, () => {
              soup.filters.clear();
              setSearchText('');
            })
          }
        >
          <XIcon class="size-4" />
          <span class="leading-none text-[6pt] text-center text-ink">
            <ShortcutLabel label="Clear" shortcut="/" />
          </span>
        </button>
      </div>
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
    <div class="flex items-center shrink-0 touch:mobile-width:-order-2">
      <Tooltip tooltip={<LabelAndHotKey label="Filter" shortcut="⌘F" />}>
        <div
          class="relative flex items-center gap-1.5 h-[22px] touch:mobile-width:h-9 px-2.5 rounded-full touch:mobile-width:min-w-35"
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

  const suffix = SHORTCUT_SUFFIXES[s.toLowerCase()] ?? SHORTCUT_SUFFIXES[s];
  if (suffix) {
    return (
      <>
        {props.label}
        <span class="ml-1 font-mono opacity-70">{suffix}</span>
      </>
    );
  }

  const idx = props.label.toLowerCase().indexOf(s.toLowerCase());
  if (idx === -1) return <>{props.label}</>;

  return (
    <>
      {props.label.slice(0, idx)}
      <span class="underline underline-offset-2 decoration-current/60">
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

  return (
    <div class="shrink-0">
      <button
        type="button"
        class="w-full flex flex-col items-center justify-center gap-2 px-2 py-2 active:bg-accent active:text-panel rounded-none"
        classList={{
          'bg-accent text-panel': isActive(),
          'text-ink-muted hover:text-accent hover:bg-accent/20': !isActive(),
        }}
        onPointerDown={(e) => runOnPress(e, props.onClick)}
        onKeyDown={(e) => runOnPress(e, props.onClick)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Show
          when={ENABLE_ANIMATED_ICONS && props.animatedIcon}
          fallback={<Dynamic component={props.icon} class="size-4" />}
        >
          {(Icon) => (
            <div class="size-4 overflow-visible">
              <Dynamic
                component={Icon()}
                triggerAnimation={isHovered() || isActive()}
              />
            </div>
          )}
        </Show>
        <span
          class="leading-none text-[6pt] text-center"
          classList={{
            'text-panel': isActive(),
            'text-ink': !isActive(),
          }}
        >
          <ShortcutLabel label={props.label} shortcut={props.shortcut} />
        </span>
      </button>
    </div>
  );
};

export const FilterDivider: Component = () => (
  <hr class="w-full border-0 border-t border-edge-muted/50 m-0 shrink-0" />
);
