import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import XIcon from '@icon/regular/x.svg?component-solid';
import SignalIcon from '@macro-icons/wide/signal.svg';
import MessageIcon from '@macro-icons/wide/chat.svg';
import {
  SplitHeaderLeft,
} from '@app/component/split-layout/components/SplitHeader';
import { LabelAndHotKey, Tooltip } from '@core/component/Tooltip';

import {
  For,
  Show,
  onCleanup,
  createSignal,
  onMount,
  createEffect,
  batch,
  type Component,
} from 'solid-js';
import {
  EXCLUDE,
  getEntityTypeFilterIcon,
  QUERY_FILTERS,
} from '@app/component/next-soup/filters/filters';
import { ENABLE_ANIMATED_ICONS } from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useEmailLinksStatus } from '@core/email-link';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ValidHotkey } from '@core/hotkey/types';
import { getIconConfig, type EntityWithValidIcon } from '@core/component/EntityIcon';
import { createElementSize } from '@solid-primitives/resize-observer';
import { IS_MAC } from '@core/constant/isMac';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { Dynamic } from 'solid-js/web';
import { SortDropdown } from '@app/component/next-soup/soup-view/sort-dropdown';
import {
  useSoupFilterMount,
  useSoupTopControlsMount,
} from '@app/component/global-sidebar/soup-filter-mount';
import {
  TaskStatusDropdown,
  TaskAssigneeDropdown,
} from '@app/component/next-soup/soup-view/task-sub-filters';
import { Portal } from 'solid-js/web';
import SplitIcon from '@icon/regular/square-half.svg';

/**
 * Keyboard shortcuts for entity type filters.
 * This object is the single source of truth for filter shortcuts,
 * used by both the filter buttons and hotkey registrations.
 */
const ENTITY_TYPE_SHORTCUTS: Record<EntityTypeFilterId, ValidHotkey> = {
  'docs-files': 'd',
  task: 't',
  email: 'l',
  channels: 'm',
  agent: 'a',
};

type EntityTypeFilterId =
  | 'docs-files'
  | 'task'
  | 'email'
  | 'channels'
  | 'agent';

const TYPE_FILTER_BUTTONS: Array<{
  id: EntityTypeFilterId;
  label: string;
}> = [
  { id: 'docs-files', label: 'Docs' },
  { id: 'task', label: 'Tasks' },
  { id: 'email', label: 'Mail' },
  { id: 'channels', label: 'Msgs' },
  { id: 'agent', label: 'Agents' },
];

const DOC_FILE_TYPE_OPTIONS: Array<{
  id: 'md' | 'canvas' | 'pdf' | 'csv';
  label: string;
  icon: EntityWithValidIcon;
}> = [
  { id: 'md', label: 'Doc', icon: 'md' },
  { id: 'canvas', label: 'Canvas', icon: 'canvas' },
  { id: 'pdf', label: 'PDF', icon: 'pdf' },
  { id: 'csv', label: 'CSV', icon: 'csv' },
];

export const SoupToolbar = () => {
  const { soup } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const filterMount = useSoupFilterMount(() => String(panel.handle.id));
  const topControlsMount = useSoupTopControlsMount(() => String(panel.handle.id));
  const [sortDropdownOpen, setSortDropdownOpen] = createSignal(false);
  const isSoupListContent = () => {
    const content = panel.handle.content();
    return (
      (content.type === 'component' && content.id === 'unified-list') ||
      content.type === 'project'
    );
  };

  const [scrollContainerRef, setScrollContainerRef] = createSignal<
    HTMLDivElement | undefined
  >(undefined);

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

  return (
    <>
      <Show when={isSoupListContent()}>
        <SplitHeaderLeft>
          <div class="relative h-full w-full pl-2">
            <ScrollIndicators scrollRef={scrollContainerRef()} />

            <div
              ref={setScrollContainerRef}
              class="flex items-center h-full w-full overflow-x-auto scrollbar-hidden overscroll-none text-xs mobile:text-sm"
            >
              <SearchBar />
            </div>
          </div>
        </SplitHeaderLeft>
      </Show>
      <Show when={filterMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <div class="w-full pb-2">
              <SoupFilters
                sortDropdownOpen={sortDropdownOpen}
                setSortDropdownOpen={setSortDropdownOpen}
              />
            </div>
          </Portal>
        )}
      </Show>
      <Show when={isSoupListContent() && topControlsMount()}>
        {(mount) => (
          <Portal mount={mount()}>
            <button
              type="button"
              class="size-7 rounded-md grid place-items-center transition-colors"
              classList={{
                'bg-accent/20 text-accent': !!soup.previewEntity(),
                'text-ink-muted hover:bg-hover/50 hover:text-ink':
                  !soup.previewEntity(),
              }}
              disabled={!soup.focus.id()}
              onClick={togglePreview}
              aria-label="Toggle preview"
              title="Preview"
            >
              <SplitIcon class="size-4" />
            </button>
            <SortDropdown
              open={sortDropdownOpen}
              onOpenChange={setSortDropdownOpen}
              iconOnly
              value={() => soup.sort.active()[0].id as SystemSortOption}
              onChange={(value) => {
                soup.sort.setAll([value]);
              }}
            />
          </Portal>
        )}
      </Show>
    </>
  );
};

type ExclusiveMode = 'inbox' | 'all' | EntityTypeFilterId;

const SoupFilters = (props: {
  sortDropdownOpen: () => boolean;
  setSortDropdownOpen: (open: boolean) => void;
}) => {
  const { soup, setSearchText, setQueryFilters } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const emailActive = useEmailLinksStatus();
  const [selectedDocFileType, setSelectedDocFileType] = createSignal<
    'md' | 'canvas' | 'pdf' | 'csv' | undefined
  >();

  const [statusDropdownOpen, setStatusDropdownOpen] = createSignal(false);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = createSignal(false);

  const clearExclusiveFilters = () => {
    soup.filters.clear();
    setSelectedDocFileType(undefined);
  };

  const activateExclusiveMode = (mode: ExclusiveMode) => {
    batch(() => {
      clearExclusiveFilters();
      setQueryFilters(QUERY_FILTERS.default);

      if (mode === 'inbox') {
        soup.filters.activate('signal');
        soup.filters.activate('not-done');
        return;
      }

      if (mode === 'all') {
        return;
      }

      soup.filters.activate(mode);
      if (mode === 'email') {
        const shouldIncludeEmails = emailActive();
        setQueryFilters({
          ...QUERY_FILTERS.email,
          email_filters: {
            recipients: shouldIncludeEmails ? [] : EXCLUDE,
          },
        });
        return;
      }

      if (mode === 'docs-files') {
        setQueryFilters(QUERY_FILTERS.docs_files);
        return;
      }

      setQueryFilters(QUERY_FILTERS[mode]);
    });
  };

  const entityTypeToggleHandlers: Record<
    EntityTypeFilterId,
    () => void
  > = {
    'docs-files': () => activateExclusiveMode('docs-files'),
    task: () => activateExclusiveMode('task'),
    email: () => activateExclusiveMode('email'),
    channels: () => activateExclusiveMode('channels'),
    agent: () => activateExclusiveMode('agent'),
  };

  const toggleDocFileType = (nextType: 'md' | 'canvas' | 'pdf' | 'csv') => {
    if (!soup.filters.isActive('docs-files')) {
      batch(() => {
        clearExclusiveFilters();
        soup.filters.activate('docs-files');
        setSelectedDocFileType(nextType);
        setQueryFilters({
          ...QUERY_FILTERS.docs_files,
          document_filters: { file_types: [nextType] },
        });
      });
      return;
    }

    const current = selectedDocFileType();
    if (current === nextType) {
      setSelectedDocFileType(undefined);
      setQueryFilters(QUERY_FILTERS.docs_files);
      return;
    }

    setSelectedDocFileType(nextType);
    setQueryFilters({
      ...QUERY_FILTERS.docs_files,
      document_filters: { file_types: [nextType] },
    });
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

  const selectedMode = (): ExclusiveMode => {
    if (soup.filters.isActive('signal') && !soup.filters.isActive('noise')) {
      return 'inbox';
    }

    const activeType = TYPE_FILTER_BUTTONS.find(({ id }) =>
      soup.filters.isActive(id)
    )?.id;
    if (activeType) {
      return activeType;
    }

    return 'all';
  };

  const hotkeyConfigs: {
    hotkey: ValidHotkey;
    description: string;
    handler: () => void;
  }[] = [
    {
      hotkey: 'i',
      description: 'Switch to Inbox',
      handler: () => activateExclusiveMode('inbox'),
    },
    // Entity type filter hotkeys
    {
      hotkey: ENTITY_TYPE_SHORTCUTS['docs-files'],
      description: 'Filter by Docs and Files',
      handler: () => activateExclusiveMode('docs-files'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.task,
      description: 'Filter by Tasks',
      handler: () => activateExclusiveMode('task'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.email,
      description: 'Filter by Mail',
      handler: () => activateExclusiveMode('email'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.channels,
      description: 'Filter by Messages',
      handler: () => activateExclusiveMode('channels'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.agent,
      description: 'Filter by Agents',
      handler: () => activateExclusiveMode('agent'),
    },
    {
      hotkey: 'u',
      description: 'Switch to All',
      handler: () => activateExclusiveMode('all'),
    },
    {
      hotkey: 's',
      description: 'Open sort menu',
      handler: () => props.setSortDropdownOpen(!props.sortDropdownOpen()),
    },
    {
      hotkey: '/',
      description: 'Clear filters',
      handler: () => {
        batch(() => {
          soup.filters.clear();
          setQueryFilters(QUERY_FILTERS.default);
          setSearchText('');
        });
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

  const taskSubFilterHotkeyDisposers = [
    registerHotkey({
      hotkey: ['shift+s'],
      scopeId: panel.splitHotkeyScope,
      condition: () => soup.filters.isActive('task'),
      description: 'Open status filter',
      keyDownHandler: () => {
        setStatusDropdownOpen((prev) => !prev);
        return true;
      },
    }),
    registerHotkey({
      hotkey: ['shift+a'],
      scopeId: panel.splitHotkeyScope,
      condition: () => soup.filters.isActive('task'),
      description: 'Open assignee filter',
      keyDownHandler: () => {
        setAssigneeDropdownOpen((prev) => !prev);
        return true;
      },
    }),
  ];

  onCleanup(() => taskSubFilterHotkeyDisposers.forEach((d) => d.dispose()));

  return (
    <>
      <div class="flex flex-col items-stretch gap-0 w-full">
        <button
          type="button"
          class="h-8 w-full px-2.5 rounded-full text-xs font-medium inline-flex items-center justify-start gap-1.5"
          aria-label="Inbox"
          title="Inbox"
          classList={{
            'bg-accent/20 text-accent': selectedMode() === 'inbox',
            'text-ink-muted hover:text-ink hover:bg-hover/40': selectedMode() !== 'inbox',
          }}
          onClick={() => activateExclusiveMode('inbox')}
        >
          <SignalIcon class="size-3.5" />
          <span class="leading-none">Inbox</span>
        </button>
        <button
          type="button"
          class="h-8 w-full px-2.5 rounded-full text-xs font-medium inline-flex items-center justify-start gap-1.5"
          aria-label="All"
          title="All"
          classList={{
            'bg-accent/20 text-accent': selectedMode() === 'all',
            'text-ink-muted hover:text-ink hover:bg-hover/40': selectedMode() !== 'all',
          }}
          onClick={() => activateExclusiveMode('all')}
        >
          <SearchIcon class="size-3.5" />
          <span class="leading-none">All</span>
        </button>
        <For each={TYPE_FILTER_BUTTONS}>
          {(filter) => (
            <button
              type="button"
              class="h-8 w-full px-2.5 rounded-full text-xs font-medium inline-flex items-center justify-start gap-1.5"
              aria-label={filter.label ?? 'Filter'}
              title={filter.label ?? 'Filter'}
              classList={{
                'bg-accent/20 text-accent': selectedMode() === filter.id,
                'text-ink-muted hover:text-ink hover:bg-hover/40':
                  selectedMode() !== filter.id,
              }}
              onClick={entityTypeToggleHandlers[filter.id]}
            >
              <Show
                when={filter.id === 'channels'}
                fallback={
                  <Dynamic
                    component={
                      getEntityTypeFilterIcon(
                        filter.id as Exclude<EntityTypeFilterId, 'channels'>
                      ).icon
                    }
                    class="size-3.5"
                  />
                }
              >
                <MessageIcon class="size-3.5" />
              </Show>
              <span class="leading-none">{filter.label}</span>
            </button>
          )}
        </For>
      </div>
      <Show when={soup.filters.isActive('docs-files')}>
        <div class="mt-1 flex flex-wrap items-center gap-1">
          <For each={DOC_FILE_TYPE_OPTIONS}>
            {(option) => (
              <button
                type="button"
                class="h-10 min-w-[40px] px-1 rounded-md flex flex-col items-center justify-center gap-0.5 text-xs"
                aria-label={option.label}
                title={option.label}
                classList={{
                  'bg-accent/20 text-accent': selectedDocFileType() === option.id,
                  'text-ink-muted hover:text-ink hover:bg-hover/40':
                    selectedDocFileType() !== option.id,
                }}
                onClick={() => toggleDocFileType(option.id)}
              >
                <Dynamic component={getIconConfig(option.icon).icon} class="size-3.5" />
                <span class="text-[8px] leading-none">{option.label}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
      <Show when={soup.filters.isActive('task')}>
        <div class="my-2 h-px w-full bg-edge-muted/50" />
        <div class="flex items-center gap-1 shrink-0">
          <TaskStatusDropdown
            open={statusDropdownOpen}
            onOpenChange={setStatusDropdownOpen}
          />
          <TaskAssigneeDropdown
            open={assigneeDropdownOpen}
            onOpenChange={setAssigneeDropdownOpen}
          />
        </div>
      </Show>
      <div class="my-2 h-px w-full bg-edge-muted/50" />
    </>
  );
};

const ScrollIndicators = (props: { scrollRef: HTMLElement | undefined }) => {
  const [leftOpacity, setLeftOpacity] = createSignal(0);
  const [rightOpacity, setRightOpacity] = createSignal(0);
  const SCROLL_THRESHOLD = 10;

  // Track size changes to update indicators
  const size = createElementSize(() => props.scrollRef);
  const containerWidth = () => size.width ?? 0;

  const updateClipIndicators = () => {
    const ref = props.scrollRef;
    if (!ref) return;
    const { scrollLeft, scrollWidth, clientWidth } = ref;

    const leftAmount = Math.min(scrollLeft, SCROLL_THRESHOLD);
    setLeftOpacity(leftAmount / SCROLL_THRESHOLD);

    const maxScroll = scrollWidth - clientWidth;
    const remainingScroll = maxScroll - scrollLeft;
    const rightAmount = Math.min(remainingScroll, SCROLL_THRESHOLD);
    setRightOpacity(rightAmount / SCROLL_THRESHOLD);
  };

  // Update indicators when size changes
  createEffect(() => {
    containerWidth(); // Track size changes
    updateClipIndicators();
  });

  onMount(() => {
    const ref = props.scrollRef;
    if (!ref) return;
    ref.addEventListener('scroll', updateClipIndicators);
    onCleanup(() => ref?.removeEventListener('scroll', updateClipIndicators));
  });
  return (
    <>
      {/* Left clip boundary indicator */}
      <div
        class="absolute pointer-events-none left-0 top-px bottom-px w-3 z-2 pattern-diagonal-4 pattern-edge mask-r-from-0% border-l border-edge-muted"
        style={{ opacity: leftOpacity() }}
      />
      {/* Right clip boundary indicator */}
      <div
        class="absolute pointer-events-none right-0 top-px bottom-px w-3 z-2 pattern-diagonal-4 pattern-edge mask-l-from-0% border-r border-edge-muted"
        style={{ opacity: rightOpacity() }}
      />
    </>
  );
};

const SearchBar = () => {
  const { searchText, setSearchText } = useSoupView();
  const panel = useSplitPanelOrThrow();

  const [ref, setRef] = createSignal<HTMLInputElement | undefined>();
  let measureSpan: HTMLSpanElement | undefined;

  const [searchFocused, setSearchFocused] = createSignal(false);
  const [measuredWidth, setMeasuredWidth] = createSignal(0);

  createEffect(() => {
    if (measureSpan) {
      measureSpan.textContent = searchText() || '';
      setMeasuredWidth(measureSpan.scrollWidth);
    }
  });

  const searchHotkey = registerHotkey({
    hotkey: ['cmd+f'],
    scopeId: panel.splitHotkeyScope,
    description: 'Search',
    keyDownHandler: () => {
      ref()?.focus();
      return true;
    },
  });

  onCleanup(searchHotkey.dispose);

  const MIN_INPUT_WIDTH = 48;

  const inputWidth = () => {
    if (!searchText() && !searchFocused()) return 0;
    return Math.max(MIN_INPUT_WIDTH, measuredWidth());
  };

  return (
    <div class="flex items-center shrink-0 grow min-w-0 mobile:-order-2">
      <Tooltip
        class="w-fit"
        placement="bottom-start"
        tooltip={<LabelAndHotKey label="Filter" shortcut="⌘F" />}
      >
        <div
          class="relative flex items-center gap-1.5 h-[22px] mobile:h-9 px-2.5 rounded-full mobile:min-w-35"
          classList={{
            'bg-accent text-panel': !!searchText() && !searchFocused(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !searchText() && !searchFocused(),
            'bg-accent/15 text-ink': searchFocused(),
          }}
          onMouseDown={(e) => {
            if (e.target !== ref()) {
              e.preventDefault();
              ref()?.focus();
            }
          }}
        >
          <Show
            when={searchText()}
            fallback={<SearchIcon class="size-4.5 shrink-0" />}
          >
            <button
              type="button"
              class="size-4.5 shrink-0 hover:opacity-60"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSearchText('');
              }}
            >
              <XIcon class="size-4.5" />
            </button>
          </Show>
          <span
            ref={(el) => {
              measureSpan = el;
            }}
            class="invisible absolute whitespace-pre"
            aria-hidden="true"
          />
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
            style={{ width: `${inputWidth()}px` }}
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
  paddingClass?: string;
}

export const FilterButton: Component<FilterButtonProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const isActive = () =>
    typeof props.isActive === 'function' ? props.isActive() : props.isActive;

  return (
    <div class="flex items-center mr-0.5 shrink-0">
      <Tooltip
        tooltip={
          <LabelAndHotKey label={props.label} shortcut={props.shortcut} />
        }
      >
        <button
          type="button"
          class={`flex items-center gap-1 h-[22px] mobile:h-9 ${props.paddingClass ?? 'pl-2 pr-2.5'} active:bg-accent active:text-panel rounded-full`}
          classList={{
            'bg-accent text-panel': isActive(),
            'text-ink-muted hover:text-accent hover:bg-accent/20': !isActive(),
          }}
          onClick={props.onClick}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Show
            when={ENABLE_ANIMATED_ICONS && props.animatedIcon}
            fallback={<Dynamic component={props.icon} class="size-3.5" />}
          >
            {(Icon) => (
              <div class="size-3.5 overflow-visible">
                <Dynamic
                  component={Icon()}
                  triggerAnimation={isHovered() || isActive()}
                />
              </div>
            )}
          </Show>
          <span class="leading-none">
            <ShortcutLabel label={props.label} shortcut={props.shortcut} />
          </span>
        </button>
      </Tooltip>
    </div>
  );
};

export const FilterDivider: Component = () => (
  <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
);
