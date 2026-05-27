import { type Component, createMemo, createSignal, For, Show } from 'solid-js';
import { Popover } from '@kobalte/core/popover';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import CheckIcon from '@phosphor/check.svg';
import SlidersIcon from '@phosphor/sliders-horizontal.svg';
import CaretDownIcon from '@phosphor/caret-down.svg';
import type {
  SortOption,
  SystemSortOption,
} from '@app/component/next-soup/soup-view/sort-options';
import {
  CHANNEL_SORT_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  EMAIL_SORT_OPTIONS,
  TASK_SORT_OPTIONS,
} from '@app/component/next-soup/soup-view/sort-options';
import {
  DEFAULT_GROUP_OPTIONS,
  EMAIL_GROUP_OPTIONS,
  type GroupOption,
  type GroupOptionId,
  INBOX_GROUP_OPTIONS,
  TASK_GROUP_OPTIONS,
} from '@app/component/next-soup/soup-view/group-options';
import { Button, cn, Layer, Tooltip } from '@ui';
import { useSoup } from '../../soup-context';
import { useSoupView } from '../soup-view-context';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { useAnalytics } from '@app/component/analytics-context';
import type { ListView } from '@app/constants/list-views';
import { isListViewID } from '@app/constants/list-views';
import {
  SearchFilterDropdown,
  VIEW_FILTER_CATEGORIES,
  type FilterCategory,
} from './unified-filter-dropdown';
import { INDEX_OPTIONS } from './search-filter-controls';

const VIEW_SORT_OPTIONS: Partial<Record<ListView, SortOption[]>> = {
  mail: EMAIL_SORT_OPTIONS,
  documents: DOCUMENT_SORT_OPTIONS,
  tasks: TASK_SORT_OPTIONS,
  channels: CHANNEL_SORT_OPTIONS,
};

const VIEW_GROUP_OPTIONS: Partial<Record<ListView, GroupOption[]>> = {
  tasks: TASK_GROUP_OPTIONS,
  mail: EMAIL_GROUP_OPTIONS,
  inbox: INBOX_GROUP_OPTIONS,
};

export const ViewOptionsPopover: Component = () => {
  const [open, setOpen] = createSignal(false);
  const soup = useSoup();
  const { soup: soupView } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const analytics = useAnalytics();

  const isPreviewActive = () => !!soup.previewEntity();

  const togglePreview = () => {
    const currentPreview = soup.previewEntity();
    if (currentPreview) {
      soup.setPreviewEntity(undefined);
      return;
    }

    const focused = soup.focus.id();
    if (!focused) return;

    analytics.track('preview_panel_use');
    soup.setPreviewEntity(focused);
  };

  const currentView = createMemo((): ListView | undefined => {
    const content = panel.handle.content();
    if (content.type !== 'component' || !isListViewID(content.id))
      return undefined;
    return content.id;
  });

  const sortOptions = createMemo(() => {
    const view = currentView();
    if (!view) return DEFAULT_SORT_OPTIONS;
    return VIEW_SORT_OPTIONS[view] ?? DEFAULT_SORT_OPTIONS;
  });

  const sortValue = createMemo(
    () => (soupView.sort.active()[0]?.id as SystemSortOption) ?? 'updated_at'
  );

  const onSortChange = (sortOption: SystemSortOption) => {
    soupView.sort.setAll([sortOption]);
  };

  const currentSortLabel = () =>
    sortOptions().find((o) => o.value === sortValue())?.label ?? 'Updated';

  const groupOptions = createMemo(() => {
    const view = currentView();
    if (!view) return DEFAULT_GROUP_OPTIONS;
    return VIEW_GROUP_OPTIONS[view] ?? DEFAULT_GROUP_OPTIONS;
  });

  const groupValue = createMemo(
    (): GroupOptionId =>
      (soupView.grouping.activeGroupId() as GroupOptionId) ?? 'none'
  );

  const onGroupChange = (groupOption: GroupOptionId) => {
    if (groupOption === 'none') {
      soupView.grouping.setActiveGroupId(undefined);
    } else {
      soupView.grouping.setActiveGroupId(groupOption);
      soupView.grouping.expandAll();
    }
  };

  const currentGroupLabel = () =>
    groupOptions().find((o) => o.value === groupValue())?.label ?? 'None';

  const filterCategories = createMemo(() => {
    const view = currentView();
    if (!view) return [];
    return VIEW_FILTER_CATEGORIES[view] ?? [];
  });

  const isOptionActive = (optionId: string) => {
    return soupView.predicates.isActive(optionId);
  };

  const toggleFilter = (optionId: string) => {
    soupView.predicates.toggle({ or: [optionId] });
  };

  const activeFilterCount = createMemo(() => {
    let count = 0;
    for (const category of filterCategories()) {
      for (const option of category.options) {
        if (isOptionActive(option.id)) count++;
      }
    }
    return count;
  });

  const hasActiveSearchIndex = createMemo(() => {
    if (currentView() !== 'search') return false;
    return INDEX_OPTIONS.some((opt) => isOptionActive(opt.value));
  });

  const hasActiveOptions = createMemo(() => {
    return activeFilterCount() > 0 || hasActiveSearchIndex() || isPreviewActive();
  });

  registerHotkey({
    hotkey: 'v',
    scopeId: panel.splitHotkeyScope,
    description: 'Open view options',
    keyDownHandler: () => {
      setOpen(true);
      return true;
    },
  });

  registerHotkey({
    hotkey: 'space',
    scopeId: panel.splitHotkeyScope,
    description: 'Toggle preview',
    keyDownHandler: () => {
      togglePreview();
      return true;
    },
  });

  return (
    <Popover open={open()} onOpenChange={setOpen} placement="bottom-end" gutter={4}>
      <Tooltip label="View options" shortcut="V">
        <Popover.Trigger
          as={Button}
          variant="ghost"
          size="sm"
          class="relative rounded-md [&_svg]:size-4 p-1.5"
          tabIndex={0}
        >
          <SlidersIcon />
          <Show when={hasActiveOptions()}>
            <span class="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent" />
          </Show>
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal>
        <Layer depth={2}>
          <Popover.Content class="z-action-menu bg-surface border border-edge-muted rounded-md shadow-lg min-w-[220px] p-2 flex flex-col gap-2">
            {/* Filters Section */}
            <Show when={currentView() === 'search'}>
              <SearchFilterDropdown />
            </Show>
            <For each={filterCategories()}>
              {(category) => (
                <FilterCategoryDropdown
                  category={category}
                  isOptionActive={isOptionActive}
                  toggleFilter={toggleFilter}
                />
              )}
            </For>

            {/* Sort Section */}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-ink-muted">Sort</span>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenu.Trigger class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm bg-ink/5 hover:bg-ink/10 focus:bg-ink/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors" tabIndex={0}>
                  <span class="text-ink">{currentSortLabel()}</span>
                  <CaretDownIcon class="size-3 text-ink-muted" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <Layer depth={3}>
                    <DropdownMenu.Content class="z-action-menu bg-surface border border-edge-muted rounded-md shadow-lg min-w-[140px] p-1">
                      <For each={sortOptions()}>
                        {(option) => (
                          <DropdownMenu.Item
                            class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                            onSelect={() => onSortChange(option.value)}
                          >
                            <span
                              class="flex-1 truncate"
                              classList={{
                                'text-ink font-medium': sortValue() === option.value,
                                'text-ink-muted': sortValue() !== option.value,
                              }}
                            >
                              {option.label}
                            </span>
                            <Show when={sortValue() === option.value}>
                              <CheckIcon class="size-3 text-accent shrink-0" />
                            </Show>
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </DropdownMenu.Content>
                  </Layer>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>

            {/* Group by Section */}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-ink-muted">Group by</span>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenu.Trigger
                  class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm bg-ink/5 hover:bg-ink/10 focus:bg-ink/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors"
                  tabIndex={0}
                >
                  <span class="text-ink">{currentGroupLabel()}</span>
                  <CaretDownIcon class="size-3 text-ink-muted" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <Layer depth={3}>
                    <DropdownMenu.Content class="z-action-menu bg-surface border border-edge-muted rounded-md shadow-lg min-w-[140px] p-1">
                      <For each={groupOptions()}>
                        {(option) => (
                          <DropdownMenu.Item
                            class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                            onSelect={() => onGroupChange(option.value)}
                          >
                            <span
                              class="flex-1 truncate"
                              classList={{
                                'text-ink font-medium':
                                  groupValue() === option.value,
                                'text-ink-muted':
                                  groupValue() !== option.value,
                              }}
                            >
                              {option.label}
                            </span>
                            <Show when={groupValue() === option.value}>
                              <CheckIcon class="size-3 text-accent shrink-0" />
                            </Show>
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </DropdownMenu.Content>
                  </Layer>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </div>

            <div class="h-px bg-edge-muted" />

            {/* Preview Toggle */}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-ink-muted">Preview</span>
              <button
                type="button"
                class={cn(
                  'relative w-7 h-4 rounded-full transition-colors p-0.5 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                  isPreviewActive() ? 'bg-accent/40' : 'bg-edge'
                )}
                onClick={togglePreview}
                tabIndex={0}
              >
                <span
                  class={cn(
                    'block size-3 rounded-full transition-transform',
                    isPreviewActive() ? 'translate-x-3 bg-accent' : 'translate-x-0 bg-ink-muted'
                  )}
                />
              </button>
            </div>
          </Popover.Content>
        </Layer>
      </Popover.Portal>
    </Popover>
  );
};

const FilterCategoryDropdown: Component<{
  category: FilterCategory;
  isOptionActive: (id: string) => boolean;
  toggleFilter: (id: string) => void;
}> = (props) => {
  const activeCount = createMemo(() => {
    return props.category.options.filter((o) => props.isOptionActive(o.id)).length;
  });

  const activeLabel = createMemo(() => {
    const active = props.category.options.filter((o) => props.isOptionActive(o.id));
    if (active.length === 0) return 'All';
    if (active.length === 1) return active[0].label;
    return `${active.length} selected`;
  });

  return (
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-ink-muted">{props.category.label}</span>
        <Show when={activeCount() > 0}>
          <span class="size-1.5 rounded-full bg-accent" />
        </Show>
      </div>
      <DropdownMenu placement="bottom-end" gutter={4}>
        <DropdownMenu.Trigger class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm bg-ink/5 hover:bg-ink/10 focus:bg-ink/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors" tabIndex={0}>
          <span class={activeCount() > 0 ? 'text-ink' : 'text-ink-muted'}>
            {activeLabel()}
          </span>
          <CaretDownIcon class="size-3 text-ink-muted" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <Layer depth={3}>
            <DropdownMenu.Content class="z-action-menu bg-surface border border-edge-muted rounded-md shadow-lg min-w-[160px] p-1">
              <For each={props.category.options}>
                {(option) => {
                  const active = () => props.isOptionActive(option.id);
                  return (
                    <DropdownMenu.Item
                      class="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs transition-colors hover:bg-ink/5 focus:bg-ink/5 outline-none cursor-default rounded-sm"
                      onSelect={() => props.toggleFilter(option.id)}
                      closeOnSelect={!props.category.multiple}
                    >
                      <span
                        class={cn(
                          'size-4 flex items-center justify-center shrink-0 rounded border transition-colors',
                          active() ? 'bg-accent border-accent' : 'border-edge-muted'
                        )}
                      >
                        <Show when={active()}>
                          <CheckIcon class="size-2.5 text-surface" />
                        </Show>
                      </span>
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
                    </DropdownMenu.Item>
                  );
                }}
              </For>
            </DropdownMenu.Content>
          </Layer>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  );
};
