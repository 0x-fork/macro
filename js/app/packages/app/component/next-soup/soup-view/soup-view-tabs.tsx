import {
  getViewPreset,
  type PresetContext,
} from '@app/component/app-sidebar/soup-filter-presets';
import { useSoup } from '@app/component/next-soup/soup-context';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { isListViewID, type ListView } from '@app/constants/list-views';
import type { TabItem } from '@core/component/Tabs';
import { useUserContext } from '@core/context/user';
import ArrowLeftIcon from '@icon/arrow-left.svg';
import ArrowRightIcon from '@icon/arrow-right.svg';
import ChevronDownIcon from '@icon/caret-down.svg';
import DotsThreeIcon from '@icon/dots-three.svg';
import { cn, Dropdown, Layer } from '@ui';
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
      soup.grouping.setActiveGroupId(undefined);
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
                ? 'bg-ink/10 text-ink'
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
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | null>(
    null
  );

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
    const totalAllTabs = tabWidths.reduce(
      (sum, w, i) => sum + w + (i > 0 ? gap : 0),
      0
    );
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
                  ? 'bg-ink/10 text-ink'
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
          <Dropdown placement="bottom-start" gutter={4}>
            <Dropdown.Trigger
              class={cn(
                TAB_BUTTON_CLASS,
                overflowTabs().some((t) => t.value === activeTab())
                  ? 'bg-ink/10 text-ink'
                  : 'text-ink-extra-muted hover:text-ink hover:bg-ink/5'
              )}
            >
              <DotsThreeIcon class="size-4" />
            </Dropdown.Trigger>
            <Dropdown.Portal>
              <Layer depth={2}>
                <Dropdown.Content class="z-action-menu bg-surface border border-edge-muted rounded-sm shadow-sm p-1 min-w-25">
                  <For each={overflowTabs()}>
                    {(item) => (
                      <Dropdown.Item
                        class="w-full px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                        classList={{
                          'font-medium text-ink': activeTab() === item.value,
                          'text-ink-muted': activeTab() !== item.value,
                        }}
                        onSelect={() => applyTabPreset(props.view, item.value)}
                      >
                        {item.label}
                      </Dropdown.Item>
                    )}
                  </For>
                </Dropdown.Content>
              </Layer>
            </Dropdown.Portal>
          </Dropdown>
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
    <Dropdown placement="bottom-start" gutter={4}>
      <Dropdown.Trigger class="flex items-center gap-1">
        <span class="truncate">{activeLabel()}</span>
        <ChevronDownIcon class="size-3 shrink-0" />
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Layer depth={2}>
          <Dropdown.Content class="z-action-menu bg-surface border border-edge-muted rounded-sm shadow-sm p-1">
            <For each={list()}>
              {(item) => (
                <Dropdown.Item
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
                </Dropdown.Item>
              )}
            </For>
          </Dropdown.Content>
        </Layer>
      </Dropdown.Portal>
    </Dropdown>
  );
};

export const MobileSoupViewTabs = () => {
  const listView = useCurrentListView();

  const hasTabs = () => {
    const view = listView();
    return view && view in VIEW_TAB_LISTS;
  };

  return (
    <Show when={hasTabs()}>
      <div class="relative px-3 py-2">
        <Switch>
          <For
            each={
              Object.keys(VIEW_TAB_LISTS) as (keyof typeof VIEW_TAB_LISTS)[]
            }
          >
            {(v) => (
              <Match when={listView() === v}>
                <MobileViewTabs view={v} />
              </Match>
            )}
          </For>
        </Switch>
      </div>
    </Show>
  );
};

const MOBILE_TAB_BUTTON_CLASS = cn(
  'px-3 py-1.5 text-sm rounded-lg transition-colors whitespace-nowrap'
);

const MobileViewTabs = (props: { view: TabbedListView }) => {
  const { applyTabPreset } = useApplyPreset();
  const { activeTab } = useSoupView();
  const list = () => VIEW_TAB_LISTS[props.view];

  const [scrollRef, setScrollRef] = createSignal<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = createSignal(false);
  const [canScrollLeft, setCanScrollLeft] = createSignal(false);
  const [canScrollRight, setCanScrollRight] = createSignal(false);
  const [activeOffscreenLeft, setActiveOffscreenLeft] = createSignal(false);
  const [activeOffscreenRight, setActiveOffscreenRight] = createSignal(false);

  const updateScrollState = () => {
    const container = scrollRef();
    if (!container) return;

    const scrollLeft = container.scrollLeft;
    const containerWidth = container.clientWidth;
    const scrollWidth = container.scrollWidth;

    setHasOverflow(scrollWidth > containerWidth);
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - containerWidth - 1);

    // Find the active tab button and check if it's visible
    const activeIndex = list().findIndex((item) => item.value === activeTab());
    if (activeIndex === -1) {
      setActiveOffscreenLeft(false);
      setActiveOffscreenRight(false);
      return;
    }

    const buttons = container.querySelectorAll('button');
    const activeButton = buttons[activeIndex] as HTMLElement | undefined;
    if (!activeButton) {
      setActiveOffscreenLeft(false);
      setActiveOffscreenRight(false);
      return;
    }

    const buttonLeft = activeButton.offsetLeft;
    const buttonRight = buttonLeft + activeButton.offsetWidth;

    setActiveOffscreenLeft(buttonLeft < scrollLeft);
    setActiveOffscreenRight(buttonRight > scrollLeft + containerWidth);
  };

  const ARROW_BUTTON_WIDTH = 28; // p-1.5 (12px) + size-4 (16px)

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollRef();
    if (!container) return;

    const buttons = Array.from(container.querySelectorAll('button'));
    const containerWidth = container.clientWidth;
    const scrollLeft = container.scrollLeft;
    const maxScroll = container.scrollWidth - containerWidth;

    // Account for arrow button overlays in visible area calculation
    const leftInset = canScrollLeft() ? ARROW_BUTTON_WIDTH : 0;
    const rightInset = canScrollRight() ? ARROW_BUTTON_WIDTH : 0;
    const visibleLeft = scrollLeft + leftInset;
    const visibleRight = scrollLeft + containerWidth - rightInset;

    if (direction === 'right') {
      // Find the last tab that's fully visible (not obscured by arrows)
      let lastFullyVisibleIdx = -1;
      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const btnLeft = btn.offsetLeft;
        const btnRight = btnLeft + btn.offsetWidth;
        if (btnLeft >= visibleLeft && btnRight <= visibleRight) {
          lastFullyVisibleIdx = i;
        }
      }

      // Scroll to the tab after the last fully visible one
      const nextIdx = lastFullyVisibleIdx + 1;
      if (nextIdx < buttons.length) {
        const targetScroll = Math.min(
          buttons[nextIdx].offsetLeft - ARROW_BUTTON_WIDTH,
          maxScroll
        );
        container.scrollTo({ left: targetScroll, behavior: 'smooth' });
      } else {
        container.scrollTo({ left: maxScroll, behavior: 'smooth' });
      }
    } else {
      // Find the first tab that's fully visible
      let firstVisibleIdx = buttons.length - 1;
      for (let i = 0; i < buttons.length; i++) {
        if (buttons[i].offsetLeft >= visibleLeft) {
          firstVisibleIdx = i;
          break;
        }
      }

      // Calculate how many tabs fit in visible area
      const visibleWidth = visibleRight - visibleLeft;
      let pageWidth = 0;
      let tabsInPage = 0;
      for (let i = 0; i < buttons.length; i++) {
        const btnWidth = buttons[i].offsetWidth + 4;
        if (pageWidth + btnWidth <= visibleWidth) {
          pageWidth += btnWidth;
          tabsInPage++;
        } else {
          break;
        }
      }

      const targetIdx = Math.max(0, firstVisibleIdx - tabsInPage);
      const targetScroll =
        targetIdx === 0
          ? 0
          : buttons[targetIdx].offsetLeft - ARROW_BUTTON_WIDTH;
      container.scrollTo({
        left: Math.max(0, targetScroll),
        behavior: 'smooth',
      });
    }
  };

  createEffect(() => {
    const container = scrollRef();
    if (!container) return;

    updateScrollState();

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(container);

    onCleanup(() => observer.disconnect());
  });

  createEffect(
    on(activeTab, () => {
      updateScrollState();

      // Scroll active tab into view
      const container = scrollRef();
      if (!container) return;

      const activeIndex = list().findIndex(
        (item) => item.value === activeTab()
      );
      if (activeIndex === -1) return;

      const buttons = container.querySelectorAll('button');
      const activeButton = buttons[activeIndex] as HTMLElement | undefined;
      if (!activeButton) return;

      const containerWidth = container.clientWidth;
      const scrollLeft = container.scrollLeft;
      const buttonLeft = activeButton.offsetLeft;
      const buttonRight = buttonLeft + activeButton.offsetWidth;
      const inset = hasOverflow() ? ARROW_BUTTON_WIDTH : 0;

      // Check if button is outside visible area (accounting for arrow buttons)
      if (buttonLeft < scrollLeft + inset) {
        container.scrollTo({
          left: Math.max(0, buttonLeft - inset),
          behavior: 'smooth',
        });
      } else if (buttonRight > scrollLeft + containerWidth - inset) {
        container.scrollTo({
          left: buttonRight - containerWidth + inset,
          behavior: 'smooth',
        });
      }
    })
  );

  return (
    <>
      <div
        ref={setScrollRef}
        class={cn(
          'flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory',
          hasOverflow() && 'scroll-pl-7 scroll-pr-7'
        )}
        onScroll={updateScrollState}
      >
        <For each={list()}>
          {(item) => (
            <button
              type="button"
              class={cn(
                MOBILE_TAB_BUTTON_CLASS,
                'snap-start',
                activeTab() === item.value
                  ? 'bg-ink/10 text-ink'
                  : 'text-ink/50 active:text-ink active:bg-ink/5'
              )}
              onClick={() => applyTabPreset(props.view, item.value)}
            >
              {item.label}
            </button>
          )}
        </For>
      </div>

      <button
        type="button"
        class={cn(
          'absolute left-0 inset-y-0 aspect-square flex items-center justify-center text-ink-muted active:text-ink bg-surface',
          (!hasOverflow() || !canScrollLeft()) && 'invisible'
        )}
        onClick={() => scroll('left')}
      >
        <ArrowLeftIcon class="size-4" />
        <Show when={activeOffscreenLeft()}>
          <span class="absolute top-0 right-0 size-1.5 rounded-full bg-accent" />
        </Show>
      </button>

      <button
        type="button"
        class={cn(
          'absolute right-0 inset-y-0 aspect-square flex items-center justify-center text-ink-muted active:text-ink bg-surface',
          (!hasOverflow() || !canScrollRight()) && 'invisible'
        )}
        onClick={() => scroll('right')}
      >
        <ArrowRightIcon class="size-4" />
        <Show when={activeOffscreenRight()}>
          <span class="absolute top-0 left-0 size-1.5 rounded-full bg-accent" />
        </Show>
      </button>
    </>
  );
};
