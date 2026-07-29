import { isListViewID, type ListView } from '@app/constants/list-views';
import { VIEW_TAB_PRESETS } from '@app/features/next-soup/sidebar/soup-filter-presets';
import {
  TypeIndicator,
  UnifiedFilterMenuItems,
} from '@app/features/next-soup/soup-view/filters-bar/unified-filter-dropdown';
import {
  COMPANY_GROUP_OPTIONS,
  type GroupOption,
  type GroupOptionId,
  TASK_GROUP_OPTIONS,
} from '@app/features/next-soup/soup-view/group-options';
import {
  CHANNEL_SORT_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  EMAIL_SORT_OPTIONS,
  type SortOption,
  type SystemSortOption,
  TASK_SORT_OPTIONS,
} from '@app/features/next-soup/soup-view/sort-options';
import {
  type SoupViewMode,
  useSoupView,
} from '@app/features/next-soup/soup-view/soup-view-context';
import {
  COMPANY_MODE_TABS,
  type TabbedListView,
  useApplyPreset,
  VIEW_TAB_LISTS,
} from '@app/features/next-soup/soup-view/soup-view-tabs';
import { useIsNewInboxEnabled } from '@app/features/next-soup/soup-view/use-is-new-inbox-enabled';
import { registerViewSwitcher } from '@app/features/next-soup/soup-view/view-switcher-controllers';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  buildSidebarLinks,
  type SidebarItem,
} from '@components/app/app-sidebar/sidebar';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import type { TabItem } from '@core/component/Tabs';
import { ENABLE_SOUP_GROUP_BY_OVERRIDE } from '@core/constant/featureFlags';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import CaretDown from '@phosphor/caret-down.svg';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import { cn, Dropdown, Hotkey, Layer } from '@ui';
import {
  createMemo,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { Dynamic } from 'solid-js/web';

/** Views offered in the switcher, in menu order. */
const VIEW_SWITCHER_ORDER: readonly ListView[] = [
  'inbox',
  'mail',
  'channels',
  'calls',
  'documents',
  'tasks',
  'agents',
  'companies',
];

/**
 * Single-select submenu for the sort/group controls, matching the filter
 * menu's checkbox rows.
 */
const OptionSubmenu = (props: {
  label: string;
  options: readonly {
    value: string;
    label: string;
    icon?: () => JSX.Element;
  }[];
  value: string;
  onChange: (value: string) => void;
}) => (
  <Dropdown.Sub>
    <Dropdown.SubTrigger>
      <span class="text-ink">{props.label}</span>
      <CaretRightIcon class="size-3 text-ink-muted" />
    </Dropdown.SubTrigger>
    <Dropdown.SubContent>
      <Dropdown.Group>
        <For each={props.options}>
          {(option) => {
            const active = () => props.value === option.value;
            return (
              <Dropdown.Item
                onSelect={() => props.onChange(option.value)}
                closeOnSelect
              >
                <TypeIndicator active={active()} />
                <Show when={option.icon}>
                  {(icon) => (
                    <span class="size-4 flex items-center justify-center shrink-0">
                      {icon()()}
                    </span>
                  )}
                </Show>
                <span
                  class={cn(
                    'flex-1 truncate',
                    active() ? 'text-ink' : 'text-ink-muted'
                  )}
                >
                  {option.label}
                </span>
              </Dropdown.Item>
            );
          }}
        </For>
      </Dropdown.Group>
    </Dropdown.SubContent>
  </Dropdown.Sub>
);

/**
 * The list panel's master dropdown: the current view's tabs on top, then the
 * filter section (formerly the toolbar's Filter dropdown), sort/group
 * controls, and a "Views" section that switches the panel to another list
 * view in place — a Preview Pair stays engaged, its Viewer returning to the
 * placeholder.
 *
 * Registers a per-split open controller so the `g v` shortcut can pop the
 * menu (see view-switcher-controllers); `f` and `s` open it too, replacing
 * the old toolbar's filter/sort hotkeys.
 */
export const SoupViewSwitcher = () => {
  const analytics = useAnalytics();
  const panel = useSplitPanelOrThrow();
  const { applyTabPreset } = useApplyPreset();
  const { soup, activeTab, viewMode, setViewMode } = useSoupView();
  const [open, setOpen] = createSignal(false);

  const view = createMemo<ListView | undefined>(() => {
    const content = panel.handle.content();
    if (content.type !== 'component') return undefined;
    return isListViewID(content.id) ? content.id : undefined;
  });

  onMount(() => {
    const dispose = registerViewSwitcher(panel.handle.id, {
      open: () => setOpen(true),
    });
    onCleanup(dispose);
  });

  // Sort options per view (the new inbox pins sort to updated_at).
  const isNewInbox = useIsNewInboxEnabled();
  const sortOptions = createMemo((): SortOption[] | undefined => {
    switch (view()) {
      case 'inbox':
        return isNewInbox() ? undefined : DEFAULT_SORT_OPTIONS;
      case 'agents':
      case 'folders':
        return DEFAULT_SORT_OPTIONS;
      case 'mail':
        return EMAIL_SORT_OPTIONS;
      case 'documents':
        return DOCUMENT_SORT_OPTIONS;
      case 'tasks':
        return TASK_SORT_OPTIONS;
      case 'channels':
        return CHANNEL_SORT_OPTIONS;
      default:
        return undefined;
    }
  });
  const activeSort = () => soup.sort.active()[0]?.id ?? 'updated_at';
  const selectSort = (value: string) => {
    soup.sort.setAll([value as SystemSortOption]);
  };

  // Group-by options (flag-gated, tasks and the Customers list only — the
  // board is inherently grouped by stage columns).
  const groupByEnabled = useFeatureFlag('enable-soup-group-by', {
    enabledOverride: ENABLE_SOUP_GROUP_BY_OVERRIDE,
  });
  const groupOptions = createMemo((): GroupOption[] | undefined => {
    if (!groupByEnabled().enabled) return undefined;
    const v = view();
    if (v === 'tasks') return TASK_GROUP_OPTIONS;
    if (v === 'companies' && viewMode() === 'list')
      return COMPANY_GROUP_OPTIONS;
    return undefined;
  });
  const activeGroup = () => soup.grouping.activeGroupId() ?? 'none';
  const selectGroup = (value: string) => {
    if (value === 'none') {
      soup.grouping.setActiveGroupId(undefined);
      return;
    }
    soup.grouping.setActiveGroupId(value as GroupOptionId);
    soup.grouping.expandAll();
  };

  // The toolbar's filter/sort dropdowns folded into this menu; their
  // hotkeys now open it.
  registerHotkey({
    hotkey: 'f',
    scopeId: panel.splitHotkeyScope,
    description: 'Open filter menu',
    hotkeyToken: TOKENS.soup.filter,
    keyDownHandler: () => {
      setOpen(true);
      return true;
    },
  });
  registerHotkey({
    hotkey: 's',
    scopeId: panel.splitHotkeyScope,
    description: 'Open sort menu',
    hotkeyToken: TOKENS.soup.sort,
    condition: () => sortOptions() !== undefined,
    keyDownHandler: () => {
      setOpen(true);
      return true;
    },
  });

  // The Customers view swaps filter tabs for its board/list mode switch.
  const tabs = createMemo<TabItem[]>(() => {
    const v = view();
    if (!v) return [];
    if (v === 'companies') return COMPANY_MODE_TABS;
    return v in VIEW_TAB_LISTS ? VIEW_TAB_LISTS[v as TabbedListView] : [];
  });

  const activeTabValue = createMemo(() => {
    const v = view();
    if (!v) return undefined;
    if (v === 'companies') return viewMode();
    return activeTab() ?? VIEW_TAB_PRESETS[v]?.default;
  });

  const triggerLabel = () => {
    const active = tabs().find((tab) => tab.value === activeTabValue());
    return active?.label ?? tabs()[0]?.label ?? '';
  };

  const selectTab = (value: string) => {
    const v = view();
    if (!v) return;
    if (v === 'companies') {
      setViewMode(value as SoupViewMode);
      return;
    }
    applyTabPreset(v, value);
  };

  const links = createMemo<SidebarItem[]>(() => {
    const all = buildSidebarLinks(false);
    return VIEW_SWITCHER_ORDER.map((id) =>
      all.find((link) => link.id === id && !link.hiddenFromSidebar)
    ).filter((link): link is SidebarItem => link !== undefined);
  });

  const switchView = (link: SidebarItem) => {
    if (link.id === view()) return;
    analytics.track('sidebar_click', {
      view: link.id,
      source: 'view-switcher',
    });
    const wasController = panel.handle.isControllerSplit();
    panel.handle.replace({
      next: { type: 'component', id: link.id, params: link.params },
      referredFrom: 'sidebar',
    });
    // A direct replace keeps the Preview Pair when the next content is still
    // a list view — clear the previous view's entity out of the Viewer.
    if (wasController) panel.handle.resetPreview();
    globalSplitManager()?.returnFocus();
  };

  return (
    <Dropdown open={open()} onOpenChange={setOpen} placement="bottom-start">
      <Dropdown.Trigger
        class={cn(
          'not-disabled:hover:bg-surface active:bg-surface focus-visible:bg-surface',
          'h-auto p-0.5 rounded-lg border-0 ring ring-edge-muted bg-surface'
        )}
        label="Switch view"
        hotkey={[TOKENS.sidebar.goToLeader, TOKENS.sidebar.viewSwitcher]}
        depth={0}
      >
        <Layer depth={2}>
          <span class="flex items-center px-2.5 py-1 text-xs font-medium ring ring-edge-muted ring-inset rounded-md bg-surface text-ink shadow-sm">
            {triggerLabel()}
          </span>
        </Layer>
        <span class="flex items-center justify-center px-1.5 text-ink-extra-muted">
          <CaretDown class="size-3" />
        </span>
      </Dropdown.Trigger>
      <Dropdown.Content class="w-56 shadow-menu" depth={2}>
        <Show when={tabs().length > 0}>
          <Dropdown.Group>
            <For each={tabs()}>
              {(tab) => {
                const isActive = () => activeTabValue() === tab.value;
                return (
                  <Dropdown.Item
                    class={cn(isActive() && 'text-ink font-semibold')}
                    onSelect={() => selectTab(tab.value)}
                  >
                    <span class="flex-1 truncate">{tab.label}</span>
                    <Show when={isActive()}>
                      <CheckIcon class="size-3.5 text-accent" />
                    </Show>
                  </Dropdown.Item>
                );
              }}
            </For>
          </Dropdown.Group>
        </Show>
        <UnifiedFilterMenuItems label="Filter" />
        <Show when={sortOptions() || groupOptions()}>
          <Dropdown.Group>
            <Dropdown.GroupLabel>Display</Dropdown.GroupLabel>
            <Show when={sortOptions()}>
              {(options) => (
                <OptionSubmenu
                  label="Sort"
                  options={options()}
                  value={activeSort()}
                  onChange={selectSort}
                />
              )}
            </Show>
            <Show when={groupOptions()}>
              {(options) => (
                <OptionSubmenu
                  label="Group"
                  options={options()}
                  value={activeGroup()}
                  onChange={selectGroup}
                />
              )}
            </Show>
          </Dropdown.Group>
        </Show>
        <Dropdown.Group>
          <Dropdown.GroupLabel>Views</Dropdown.GroupLabel>
          <For each={links()}>
            {(link) => {
              const isActive = () => link.id === view();
              return (
                <Dropdown.Item
                  class={cn(
                    'min-h-8 gap-2 px-2.5 text-[13px]',
                    isActive() &&
                      'bg-ink/6 text-ink hover:bg-ink/6 data-highlighted:bg-ink/6'
                  )}
                  onSelect={() => switchView(link)}
                >
                  <Show when={link.icon}>
                    <div class="shrink-0 [&_svg]:size-3.5">
                      <Dynamic component={link.icon} />
                    </div>
                  </Show>
                  <span class="min-w-0 flex-1 truncate text-ink">
                    {link.label}
                  </span>
                  <Hotkey
                    token={link.hotkeyToken}
                    theme="subtle"
                    class="ml-6"
                  />
                </Dropdown.Item>
              );
            }}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
};
