import { isListViewID, type ListView } from '@app/constants/list-views';
import { VIEW_TAB_PRESETS } from '@app/features/next-soup/sidebar/soup-filter-presets';
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
import { registerViewSwitcher } from '@app/features/next-soup/soup-view/view-switcher-controllers';
import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import {
  buildSidebarLinks,
  type SidebarItem,
} from '@components/app/app-sidebar/sidebar';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import type { TabItem } from '@core/component/Tabs';
import { TOKENS } from '@core/hotkey/tokens';
import CaretDown from '@phosphor/caret-down.svg';
import CheckIcon from '@phosphor/check.svg';
import { cn, Dropdown, Hotkey, Layer } from '@ui';
import {
  createMemo,
  createSignal,
  For,
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
 * The list panel's combined tab + view dropdown, replacing the old segmented
 * tabs (Signal/Noise/All) and the app sidebar's view links. The top section
 * holds the current view's tabs; the "Views" section below switches the panel
 * to another list view in place — a Preview Pair stays engaged, its Viewer
 * returning to the placeholder.
 *
 * Registers a per-split open controller so the `g v` shortcut can pop the
 * menu (see view-switcher-controllers).
 */
export const SoupViewSwitcher = () => {
  const analytics = useAnalytics();
  const panel = useSplitPanelOrThrow();
  const { applyTabPreset } = useApplyPreset();
  const { activeTab, viewMode, setViewMode } = useSoupView();
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
