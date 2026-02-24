import SearchIcon from '@macro-icons/macro-magnifying-glass.svg';
import BackspaceIcon from '@icon/regular/backspace.svg?component-solid';
import XIcon from '@icon/regular/x.svg?component-solid';
import PreviewIcon from '@macro-icons/wide/preview.svg';
import NoiseIcon from '@macro-icons/wide/noise.svg';
import SignalIcon from '@macro-icons/wide/signal.svg';
import SentIcon from '@icon/regular/paper-plane-tilt.svg';
import { AnimatedNoiseIcon } from '@macro-icons/wide/animating/noise';
import { AnimatedSignalIcon } from '@macro-icons/wide/animating/signal';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@app/component/split-layout/components/SplitHeader';

import {
  For,
  Show,
  onCleanup,
  createEffect,
  createSignal,
  batch,
  type Component,
} from 'solid-js';
import {
  ANIMATED_ICONS,
  ENTITY_TYPE_FILTER_CONFIGS,
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
import { IS_MAC } from '@core/constant/isMac';
import type { SystemSortOption } from '@app/component/next-soup/soup-view/sort-options';
import { Dynamic } from 'solid-js/web';
import { SortDropdown } from '@app/component/next-soup/soup-view/sort-dropdown';
import { SettingsButton } from '@app/component/settings/SettingsButton';
import {
  TaskStatusDropdown,
  TaskAssigneeDropdown,
} from '@app/component/next-soup/soup-view/task-sub-filters';
import { isMobile } from '@core/mobile/isMobile';
import { useEmail, useUserId } from '@core/context/user';
import { ChannelTypeEnum } from '@service-comms/client';

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
  messages: 'm',
  agent: 'a',
  file: 'f',
};

let focusSearchInput: (() => void) | undefined;

export const SoupToolbar = () => {
  const { soup, setSearchText, setQueryFilters } = useSoupView();
  const mobile = isMobile();

  const handleClear = () => {
    batch(() => {
      soup.filters.clear();
      setSearchText('');
      setQueryFilters(QUERY_FILTERS.default);
    });
  };

  return (
    <>
      <SplitHeaderLeft>
        <div class="flex items-center h-full w-full overflow-x-auto scrollbar-hidden overscroll-none text-xs mobile:text-sm">
          <Show when={mobile}>
            <SoupFilters />
          </Show>
          <div class="min-w-0 flex-1">
            <SearchBar />
          </div>
        </div>
      </SplitHeaderLeft>

      <SplitHeaderRight>
        <button
          type="button"
          class="flex items-center justify-center size-[22px] rounded-full text-ink-muted hover:text-accent hover:bg-accent/20 active:bg-accent active:text-panel"
          onMouseDown={(e) => {
            e.preventDefault();
            handleClear();
          }}
        >
          <BackspaceIcon class="size-4.5" />
        </button>
        <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
        <SettingsButton />
      </SplitHeaderRight>
    </>
  );
};

export const SoupFilterSidebar = () => {
  return (
    <div class="w-[136px] shrink-0 border-r border-edge-muted bg-panel max-sm:hidden">
      <div class="h-full overflow-y-auto p-3">
        <SoupFilters variant="sidebar" />
      </div>
    </div>
  );
};

type EntityTypeFilterId =
  | 'document'
  | 'task'
  | 'messages'
  | 'agent'
  | 'file';

const SoupFilters = (props: { variant?: 'topbar' | 'sidebar' }) => {
  const { soup, setSearchText, setQueryFilters, queryFilters } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const emailActive = useEmailLinksStatus();
  const userId = useUserId();
  const userEmail = useEmail();
  const isSidebar = () => props.variant === 'sidebar';

  const [sortDropdownOpen, setSortDropdownOpen] = createSignal(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = createSignal(false);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = createSignal(false);

  const toggleFocus = (id: 'signal' | 'noise') => {
    if (soup.filters.isActive(id)) {
      soup.filters.toggle('explicit-noise');
      soup.filters.deactivate('not-done');
    } else {
      soup.filters.toggle(id);
      soup.filters.activate('not-done');
    }
  };

  const toggleSent = () => {
    const currentUserId = userId();
    const currentUserEmail = userEmail();

    if (soup.filters.isActive('sent')) {
      batch(() => {
        soup.filters.deactivate('sent');
        setQueryFilters(QUERY_FILTERS.default);
      });
      return;
    }

    batch(() => {
      soup.filters.activate('sent');
      soup.filters.deactivate('not-done');
      soup.filters.deactivate('explicit-noise');
      setQueryFilters({
        document_filters: { document_ids: EXCLUDE },
        project_filters: { project_ids: EXCLUDE },
        chat_filters: currentUserId
          ? { owners: [currentUserId], role: ['user'] }
          : { chat_ids: EXCLUDE },
        channel_filters: currentUserId
          ? { sender_ids: [currentUserId] }
          : { channel_ids: EXCLUDE },
        email_filters: currentUserEmail
          ? { senders: [currentUserEmail] }
          : { email_thread_ids: EXCLUDE },
      });
    });
  };

  const toggleUnread = () => {
    soup.filters.toggle('unread');
  };

  const toggleEntityType = (id: EntityTypeFilterId) => {
    const willBeActive = !soup.filters.isActive(id);
    batch(() => {
      soup.filters.toggle(id);
      setQueryFilters(willBeActive ? QUERY_FILTERS[id] : QUERY_FILTERS.default);
    });
  };

  // Email has special handling for email integration status
  const toggleEmail = () => {
    const willBeActive = !soup.filters.isActive('email');
    batch(() => {
      soup.filters.toggle('email');
      if (willBeActive) {
        const shouldIncludeEmails = emailActive();
        setQueryFilters({
          ...QUERY_FILTERS.email,
          email_filters: {
            recipients: shouldIncludeEmails ? [] : EXCLUDE,
          },
        });
      } else {
        setQueryFilters(QUERY_FILTERS.default);
      }
    });
  };

  const entityTypeToggleHandlers: Record<
    (typeof ENTITY_TYPE_FILTER_CONFIGS)[number]['id'],
    () => void
  > = {
    document: () => toggleEntityType('document'),
    task: () => toggleEntityType('task'),
    email: toggleEmail,
    messages: () => toggleEntityType('messages'),
    agent: () => toggleEntityType('agent'),
    file: () => toggleEntityType('file'),
  };

  const activeMessageSubFilter = () => {
    const types = queryFilters().channel_filters?.channel_types ?? [];
    if (types.length === 0) return 'all';
    if (
      types.length === 1 &&
      types[0] === ChannelTypeEnum.DirectMessage
    ) {
      return 'people';
    }
    return 'teams';
  };

  const setMessagesSubFilter = (value: 'all' | 'people' | 'teams') => {
    if (!soup.filters.isActive('messages')) return;

    const channelFilter =
      value === 'people'
        ? { channel_types: [ChannelTypeEnum.DirectMessage] }
        : value === 'teams'
          ? {
              channel_types: [
                ChannelTypeEnum.Private,
                ChannelTypeEnum.Organization,
                ChannelTypeEnum.Public,
              ],
            }
          : {};

    setQueryFilters({
      ...QUERY_FILTERS.messages,
      channel_filters: channelFilter,
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

  const hotkeyConfigs: {
    hotkey: ValidHotkey;
    description: string;
    handler: () => void;
  }[] = [
    {
      hotkey: 'i',
      description: 'Toggle Inbox',
      handler: () => toggleFocus('signal'),
    },
    {
      hotkey: 'o',
      description: 'Toggle Other',
      handler: () => toggleFocus('noise'),
    },
    {
      hotkey: 'y',
      description: 'Toggle Sent',
      handler: () => toggleSent(),
    },
    // Entity type filter hotkeys
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.document,
      description: 'Filter by Docs',
      handler: () => toggleEntityType('document'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.task,
      description: 'Filter by Tasks',
      handler: () => toggleEntityType('task'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.email,
      description: 'Filter by Mail',
      handler: toggleEmail,
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.messages,
      description: 'Filter by Messages',
      handler: () => toggleEntityType('messages'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.agent,
      description: 'Filter by Agents',
      handler: () => toggleEntityType('agent'),
    },
    {
      hotkey: ENTITY_TYPE_SHORTCUTS.file,
      description: 'Filter by Files',
      handler: () => toggleEntityType('file'),
    },
    {
      hotkey: 'u',
      description: 'Filter by Unread',
      handler: toggleUnread,
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
        batch(() => {
          soup.filters.clear();
          setQueryFilters(QUERY_FILTERS.default);
          setSearchText('');
        });
        focusSearchInput?.();
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
    <div
      classList={{
        'flex items-center shrink-0': !isSidebar(),
        'flex flex-col gap-4 text-sm': isSidebar(),
      }}
    >
      <Show when={isSidebar()}>
        <div class="text-xs font-medium text-text-muted uppercase tracking-wide px-1">
          View
        </div>
      </Show>
      <div classList={{ 'flex items-center': !isSidebar(), 'flex flex-col gap-1': isSidebar() }}>
        {/* Inbox toggle */}
        <FilterButton
          icon={SignalIcon}
          animatedIcon={AnimatedSignalIcon}
          label="Inbox"
          shortcut="i"
          isActive={soup.filters.isActive('signal')}
          onClick={() => toggleFocus('signal')}
          sidebar={isSidebar()}
        />
        {/* Sent toggle */}
        <FilterButton
          icon={SentIcon}
          label="Sent"
          shortcut="y"
          isActive={soup.filters.isActive('sent')}
          onClick={toggleSent}
          sidebar={isSidebar()}
        />
        {/* Other toggle */}
        <FilterButton
          icon={NoiseIcon}
          animatedIcon={AnimatedNoiseIcon}
          label="Other"
          shortcut="o"
          isActive={soup.filters.isActive('noise')}
          onClick={() => toggleFocus('noise')}
          sidebar={isSidebar()}
        />
      </div>
      <Show when={!isSidebar()}>
        <FilterDivider />
      </Show>
      <Show when={isSidebar()}>
        <div class="h-px bg-edge-muted/60" />
      </Show>
      <div classList={{ 'flex items-center': !isSidebar(), 'flex flex-col gap-1': isSidebar() }}>
        {/* Unread filter */}
        <div classList={{ 'flex items-center mr-0.5 shrink-0': !isSidebar(), 'w-full': isSidebar() }}>
          <button
            type="button"
            class="flex items-center gap-1 h-[22px] mobile:h-9 pr-2.5 pl-1 active:bg-accent active:text-panel rounded-full"
            classList={{
              'bg-accent text-panel': soup.filters.isActive('unread'),
              'text-ink-muted hover:text-accent hover:bg-accent/20':
                !soup.filters.isActive('unread'),
              'w-full justify-start h-8 px-2.5': isSidebar(),
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              toggleUnread();
            }}
          >
            <svg
              class="size-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="4" />
            </svg>
            <span class="leading-none">
              <ShortcutLabel label="Unread" shortcut="u" />
            </span>
          </button>
        </div>
        {/* Entity type icons */}
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
                onClick={entityTypeToggleHandlers[filter.id]}
                paddingClass="px-2.5"
                sidebar={isSidebar()}
              />
            );
          }}
        </For>
      </div>
      <Show when={soup.filters.isActive('task')}>
        <Show when={!isSidebar()}>
          <FilterDivider />
        </Show>
        <Show when={isSidebar()}>
          <div class="h-px bg-edge-muted/60" />
        </Show>
        <div
          classList={{
            'flex items-center gap-1 shrink-0': !isSidebar(),
            'flex flex-col gap-1': isSidebar(),
          }}
        >
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
      <Show when={soup.filters.isActive('messages')}>
        <Show when={!isSidebar()}>
          <FilterDivider />
        </Show>
        <Show when={isSidebar()}>
          <div class="h-px bg-edge-muted/60" />
        </Show>
        <div
          classList={{
            'flex items-center gap-1 shrink-0': !isSidebar(),
            'flex flex-col gap-1': isSidebar(),
          }}
        >
          <MessageSubFilterButton
            label="People"
            active={activeMessageSubFilter() === 'people'}
            sidebar={isSidebar()}
            onMouseDown={() => setMessagesSubFilter('people')}
          />
          <MessageSubFilterButton
            label="Teams"
            active={activeMessageSubFilter() === 'teams'}
            sidebar={isSidebar()}
            onMouseDown={() => setMessagesSubFilter('teams')}
          />
        </div>
      </Show>
      <Show when={!isSidebar()}>
        <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
      </Show>
      <Show when={isSidebar()}>
        <div class="h-px bg-edge-muted/60" />
      </Show>
      <div classList={{ 'flex items-center': !isSidebar(), 'flex flex-col gap-1': isSidebar() }}>
        {/* Preview toggle */}
        <button
          type="button"
          class="flex items-center gap-1.5 h-[22px] mobile:h-9 px-2.5 active:bg-accent active:text-panel rounded-full"
          classList={{
            'bg-accent text-panel': !!soup.previewEntity(),
            'text-ink-muted hover:text-accent hover:bg-accent/20':
              !soup.previewEntity(),
            'w-full justify-start h-8': isSidebar(),
          }}
          disabled={!soup.focus.id()}
          onMouseDown={(e) => {
            e.preventDefault();
            togglePreview();
          }}
        >
          <PreviewIcon class="size-4.5" />
          <span class="leading-none">
            <ShortcutLabel label="Preview" shortcut="space" />
          </span>
        </button>
        {/* Sort dropdown */}
        <SortDropdown
          open={sortDropdownOpen}
          onOpenChange={setSortDropdownOpen}
          value={() => soup.sort.active()[0].id as SystemSortOption}
          onChange={(value) => {
            soup.sort.setAll([value]);
          }}
        />
      </div>
      <Show when={!isSidebar()}>
        <div class="mobile:-order-1">
          <FilterDivider />
        </div>
      </Show>
    </div>
  );
};

const SearchBar = () => {
  const { soup, searchText, setSearchText, queryFilters } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const [inputRef, setInputRef] = createSignal<HTMLInputElement | undefined>();

  createEffect(() => {
    const focus = () => inputRef()?.focus();
    focusSearchInput = focus;
    onCleanup(() => {
      if (focusSearchInput === focus) {
        focusSearchInput = undefined;
      }
    });
  });

  const searchHotkey = registerHotkey({
    hotkey: ['cmd+f'],
    scopeId: panel.splitHotkeyScope,
    description: 'Search',
    keyDownHandler: () => {
      inputRef()?.focus();
      return true;
    },
  });

  onCleanup(searchHotkey.dispose);

  const filterSummary = () => {
    const parts: string[] = [];
    const activeIds = soup.filters.activeIds();
    const messageTypes = queryFilters().channel_filters?.channel_types ?? [];

    const typeLabel = activeIds.includes('messages')
      ? 'messages'
      : activeIds.includes('email')
        ? 'emails'
        : activeIds.includes('task')
          ? 'tasks'
          : activeIds.includes('document')
            ? 'docs'
            : activeIds.includes('agent')
              ? 'agents'
              : activeIds.includes('file')
                ? 'files'
                : '';

    if (typeLabel) parts.push(typeLabel);

    if (activeIds.includes('messages')) {
      if (
        messageTypes.length === 1 &&
        messageTypes[0] === ChannelTypeEnum.DirectMessage
      ) {
        parts.push('from people');
      } else if (messageTypes.length > 0) {
        parts.push('in teams');
      }
    }

    if (activeIds.includes('signal')) parts.push('in inbox');
    if (activeIds.includes('noise')) parts.push('in other');
    if (activeIds.includes('sent')) {
      if (activeIds.includes('messages')) {
        parts.push('sent by me');
      } else if (activeIds.includes('email')) {
        parts.push('sent emails');
      } else {
        parts.push('sent');
      }
    }
    if (activeIds.includes('unread')) parts.push('unread');

    if (parts.length === 0) return 'filters';
    return parts.join(' ');
  };

  return (
    <div class="flex items-center shrink-0 grow min-w-0 mobile:-order-2">
      <div
        class="relative flex items-center gap-1.5 h-[22px] mobile:h-9 px-2.5 mobile:min-w-35 text-ink-muted"
        onMouseDown={(e) => {
          if (e.target !== inputRef()) {
            e.preventDefault();
            inputRef()?.focus();
          }
        }}
      >
        <SearchIcon class="size-4.5 shrink-0" />
        <Show when={searchText()}>
          <button
            type="button"
            class="size-4.5 shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSearchText('');
            }}
          >
            <XIcon class="size-4.5" />
          </button>
        </Show>
        <Show when={!searchText()}>
          <span class="leading-none pointer-events-none whitespace-nowrap">
            Search [{filterSummary()}] [{IS_MAC ? 'cmdF' : 'ctrlF'}] or search
            all `/`
          </span>
        </Show>
        <Show when={searchText()}>
          <span class="leading-none pointer-events-none whitespace-nowrap">
            Search [{filterSummary()}]
          </span>
        </Show>
        <input
          ref={setInputRef}
          type="text"
          value={searchText()}
          onInput={(e) => setSearchText(e.currentTarget.value)}
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
          style={{ width: searchText() ? '240px' : '0px' }}
        />
      </div>
    </div>
  );
};

const MessageSubFilterButton = (props: {
  label: string;
  active: boolean;
  sidebar: boolean;
  onMouseDown: () => void;
}) => {
  return (
    <button
      type="button"
      class="flex items-center gap-1 h-[22px] mobile:h-9 px-2.5 active:bg-accent active:text-panel rounded-full"
      classList={{
        'bg-accent text-panel': props.active,
        'text-ink-muted hover:text-accent hover:bg-accent/20': !props.active,
        'w-full justify-start h-8': props.sidebar,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        props.onMouseDown();
      }}
    >
      <span class="leading-none">{props.label}</span>
    </button>
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
  sidebar?: boolean;
}

export const FilterButton: Component<FilterButtonProps> = (props) => {
  const [isHovered, setIsHovered] = createSignal(false);

  const isActive = () =>
    typeof props.isActive === 'function' ? props.isActive() : props.isActive;

  return (
    <div
      classList={{
        'flex items-center mr-0.5 shrink-0': !props.sidebar,
        'w-full': !!props.sidebar,
      }}
    >
      <button
        type="button"
        class={`flex items-center gap-1 h-[22px] mobile:h-9 ${props.paddingClass ?? 'pl-2 pr-2.5'} active:bg-accent active:text-panel rounded-full`}
        classList={{
          'bg-accent text-panel': isActive(),
          'text-ink-muted hover:text-accent hover:bg-accent/20': !isActive(),
          'w-full justify-start h-8 px-2.5': !!props.sidebar,
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          props.onClick();
        }}
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
    </div>
  );
};

export const FilterDivider: Component = () => (
  <div class="mx-0.5 w-px h-5 bg-edge-muted/50 shrink-0" />
);
