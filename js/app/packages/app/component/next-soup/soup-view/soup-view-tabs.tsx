import {
  VIEW_TAB_PRESETS,
  type PresetContext,
  getViewPreset,
} from '@app/component/app-sidebar/soup-filter-presets';
import { useSoup } from '@app/component/next-soup/soup-context';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { isListViewID, type ListView } from '@app/constants/list-views';
import { useUserContext } from '@core/context/user';
import { cn } from '@ui/utils/classname';
import { Tabs } from '@core/component/Tabs';
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';

type TabItem = {
  value: string;
  label: string;
};
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { Layer } from '@ui';
import ChevronDownIcon from '@icon/regular/caret-down.svg';
import DotsThreeIcon from '@icon/regular/dots-three.svg';

/** Views that have tab definitions. Shared between VIEW_TAB_LISTS and VIEW_TAB_PRESETS. */
export type TabbedListView = Extract<
  ListView,
  | 'inbox'
  | 'agents'
  | 'mail'
  | 'documents'
  | 'tasks'
  | 'channels'
  | 'calls'
  | 'folders'
>;

/** Tab definitions for each list view. */
export const VIEW_TAB_LISTS: Record<TabbedListView, TabItem[]> = {
  inbox: [
    { value: 'signal', label: 'Signal' },
    { value: 'noise', label: 'Noise' },
    { value: 'all', label: 'All' },
  ],
  agents: [
    { value: 'owned', label: 'Owned' },
    { value: 'running', label: 'Running' },
    { value: 'shared', label: 'Shared' },
    { value: 'automations', label: 'Automations' },
  ],
  mail: [
    { value: 'important', label: 'Signal' },
    { value: 'noise', label: 'Noise' },
    { value: 'calendar', label: 'Calendar' },
    { value: 'sent', label: 'Sent' },
    { value: 'drafts', label: 'Drafts' },
    { value: 'shared', label: 'Shared' },
    { value: 'all', label: 'All' },
  ],
  documents: [
    { value: 'owned', label: 'Owned' },
    { value: 'shared', label: 'Shared' },
    { value: 'attachments', label: 'Attachments' },
    { value: 'all', label: 'All' },
  ],
  tasks: [
    { value: 'assigned-to-me', label: 'Assigned' },
    { value: 'created-by-me', label: 'Created' },
    { value: 'all', label: 'All' },
  ],
  channels: [
    { value: 'recent', label: 'Recent' },
    { value: 'people', label: 'People' },
    { value: 'teams', label: 'Teams' },
  ],
  calls: [
    { value: 'all', label: 'All' },
    { value: 'unattended', label: 'Unattended' },
  ],
  folders: [
    { value: 'owned', label: 'Owned' },
    { value: 'all', label: 'All' },
  ],
};

const useCurrentListView = () => {
  const panel = useSplitPanelOrThrow();

  return createMemo<ListView | undefined>(() => {
    const content = panel.handle.content();

    if (content.type !== 'component') return;

    return isListViewID(content.id) ? content.id : undefined;
  });
};

export const useApplyPreset = () => {
  const soup = useSoup();
  const { queryFilters, setActiveTab } = useSoupView();
  const user = useUserContext();

  const getPresetContext = (): PresetContext => ({
    userId: user.userId(),
    email: user.email(),
  });

  const applyTabPreset = (view: ListView, tabId: string): boolean => {
    const preset = getViewPreset(view, tabId, getPresetContext());
    if (!preset) return false;

    batch(() => {
      setActiveTab(tabId);
      queryFilters.replace(preset.filters);
      soup.predicates.set(preset.clientFilters);
    });
    return true;
  };

  return { applyTabPreset };
};

export const SoupViewTabs = (props: { overflow?: boolean }) => {
  const listView = useCurrentListView();
  const TabsComponent = props.overflow ? OverflowViewTabs : ViewTabs;

  return (
    <Switch>
      <For each={Object.keys(VIEW_TAB_LISTS) as TabbedListView[]}>
        {(v) => (
          <Match when={listView() === v}>
            <TabsComponent view={v} />
          </Match>
        )}
      </For>
    </Switch>
  );
};

const ViewTabs = (props: { view: TabbedListView }) => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();
  const list = () => VIEW_TAB_LISTS[props.view];

  return (
    <div class="flex items-center gap-1">
      <For each={list()}>
        {(item) => (
          <button
            type="button"
            class={cn(
              'px-2 py-0.5 text-xs rounded-sm transition-all',
              activeTab() === item.value
                ? 'bg-accent/30 text-ink shadow-inset-bevel'
                : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
            )}
            onClick={() => applyTabPreset(props.view, item.value)}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
};

const TAB_BUTTON_CLASS = cn(
  'px-2 py-0.5 text-xs rounded-sm transition-colors whitespace-nowrap'
);

const OverflowViewTabs = (props: { view: TabbedListView }) => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();
  const list = () => VIEW_TAB_LISTS[props.view];

  let measureRef: HTMLDivElement | undefined;
  let tabWidths: number[] = [];

  const [visibleCount, setVisibleCount] = createSignal(list().length);
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | null>(null);

  const measureTabWidths = () => {
    if (!measureRef) return;
    const buttons = measureRef.querySelectorAll('button');
    tabWidths = Array.from(buttons).map((btn) => btn.offsetWidth);
  };

  const calculateVisibleTabs = () => {
    const container = containerRef();
    if (!container || tabWidths.length === 0) return;

    const containerWidth = container.offsetWidth;
    const items = list();
    const overflowButtonWidth = 28;
    const gap = 4;

    // First check if all tabs fit
    const totalAllTabs = tabWidths.reduce((sum, w, i) => sum + w + (i > 0 ? gap : 0), 0);
    if (totalAllTabs <= containerWidth) {
      setVisibleCount(items.length);
      return;
    }

    // Otherwise, find how many fit with overflow button
    let totalWidth = 0;
    let count = 0;
    const availableWidth = containerWidth - overflowButtonWidth - gap;

    for (let i = 0; i < items.length; i++) {
      const btnWidth = tabWidths[i] || 50;
      const widthWithGap = totalWidth + btnWidth + (count > 0 ? gap : 0);

      if (widthWithGap <= availableWidth) {
        totalWidth = widthWithGap;
        count++;
      } else {
        break;
      }
    }

    setVisibleCount(Math.max(1, count));
  };

  createEffect(
    on(list, () => {
      measureTabWidths();
      calculateVisibleTabs();
    })
  );

  createEffect(() => {
    const container = containerRef();
    if (!container) return;

    measureTabWidths();

    const observer = new ResizeObserver(calculateVisibleTabs);
    observer.observe(container);

    calculateVisibleTabs();

    onCleanup(() => observer.disconnect());
  });

  const visibleTabs = () => list().slice(0, visibleCount());
  const overflowTabs = () => list().slice(visibleCount());
  const hasOverflow = () => overflowTabs().length > 0;

  return (
    <div ref={setContainerRef} class="relative flex-1 min-w-0">
      {/* Hidden measure container */}
      <div
        ref={measureRef}
        class="fixed invisible pointer-events-none flex items-center gap-1"
        aria-hidden="true"
      >
        <For each={list()}>
          {(item) => (
            <button type="button" class={TAB_BUTTON_CLASS}>
              {item.label}
            </button>
          )}
        </For>
      </div>

      {/* Visible tabs */}
      <div class="flex items-center gap-1">
        <For each={visibleTabs()}>
          {(item) => (
            <button
              type="button"
              class={cn(
                TAB_BUTTON_CLASS,
                activeTab() === item.value
                  ? 'bg-accent/30 text-ink shadow-inset-bevel'
                  : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
              )}
              onClick={() => applyTabPreset(props.view, item.value)}
            >
              {item.label}
            </button>
          )}
        </For>

        {/* Overflow dropdown */}
        <Show when={hasOverflow()}>
          <DropdownMenu placement="bottom-start" gutter={4}>
            <DropdownMenu.Trigger
              class={cn(
                TAB_BUTTON_CLASS,
                overflowTabs().some((t) => t.value === activeTab())
                  ? 'bg-accent/30 text-ink shadow-inset-bevel'
                  : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
              )}
            >
              <DotsThreeIcon class="size-4" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <Layer depth={2}>
                <DropdownMenu.Content class="z-action-menu bg-menu border border-edge-muted rounded-sm shadow-sm p-1 min-w-[100px]">
                  <For each={overflowTabs()}>
                    {(item) => (
                      <DropdownMenu.Item
                        class="w-full px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                        classList={{
                          'font-medium text-ink': activeTab() === item.value,
                          'text-ink-muted': activeTab() !== item.value,
                        }}
                        onSelect={() => applyTabPreset(props.view, item.value)}
                      >
                        {item.label}
                      </DropdownMenu.Item>
                    )}
                  </For>
                </DropdownMenu.Content>
              </Layer>
            </DropdownMenu.Portal>
          </DropdownMenu>
        </Show>
      </div>
    </div>
  );
};

/** Compact dropdown variant of tabs, used when the header is too narrow for the full segmented control. */
export const CollapsedSoupViewTabs = () => {
  const listView = useCurrentListView();
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();

  const list = createMemo(() => {
    const view = listView();
    if (!view || !(view in VIEW_TAB_LISTS)) return [];
    return VIEW_TAB_LISTS[view as TabbedListView];
  });

  const activeLabel = createMemo(() => {
    const tab = activeTab();
    return list().find((item) => item.value === tab)?.label ?? list()[0]?.label;
  });

  return (
    <DropdownMenu placement="bottom-start" gutter={4}>
      <DropdownMenu.Trigger class="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-xs border border-edge-muted hover:bg-ink/6 transition-colors">
        <span class="truncate">{activeLabel()}</span>
        <ChevronDownIcon class="size-3 shrink-0" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <Layer depth={2}>
          <DropdownMenu.Content class="z-action-menu bg-page border border-edge-muted rounded-sm shadow-sm p-1">
            <For each={list()}>
              {(item) => (
                <DropdownMenu.Item
                  class="w-full px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-md"
                  classList={{
                    'font-semibold': activeTab() === item.value,
                  }}
                  onSelect={() => {
                    const view = listView();
                    if (view) applyTabPreset(view, item.value);
                  }}
                >
                  {item.label}
                </DropdownMenu.Item>
              )}
            </For>
          </DropdownMenu.Content>
        </Layer>
      </DropdownMenu.Portal>
    </DropdownMenu>
  );
};

export const MobileSoupViewTabs = () => {
  const listView = useCurrentListView();

  return (
    <div class="bg-panel border-t border-edge-muted h-11 px-1">
      <Switch>
        <For
          each={Object.keys(VIEW_TAB_LISTS) as (keyof typeof VIEW_TAB_LISTS)[]}
        >
          {(v) => (
            <Match when={listView() === v}>
              <MobileViewTabs view={v} />
            </Match>
          )}
        </For>
      </Switch>
    </div>
  );
};

const MobileViewTabs = (props: { view: TabbedListView }) => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();
  const list = () => VIEW_TAB_LISTS[props.view];

  return (
    <Tabs
      list={list()}
      value={activeTab()}
      defaultValue={VIEW_TAB_PRESETS[props.view].default}
      onChange={(value) => applyTabPreset(props.view, value)}
      indicatorPosition="top"
      class="**:data-indicator:h-[3px]"
    />
  );
};
