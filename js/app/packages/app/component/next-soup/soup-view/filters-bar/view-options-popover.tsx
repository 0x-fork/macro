import {
  type Accessor,
  batch,
  type Component,
  createMemo,
  createSignal,
  For,
  type JSX,
  Show,
} from 'solid-js';
import { Popover } from '@kobalte/core/popover';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import StatusInProgress from '@icon/task-in-progress-circle-pie.svg';
import PriorityHigh from '@icon/wide-priority-high.svg';
import CalendarIcon from '@phosphor/calendar-blank.svg';
import CheckIcon from '@phosphor/check.svg';
import CircleDashedIcon from '@phosphor/circle-dashed.svg';
import FolderIcon from '@phosphor/folder-simple.svg';
import SlidersIcon from '@phosphor/sliders-horizontal.svg';
import TagIcon from '@phosphor/tag.svg';
import UsersIcon from '@phosphor/users.svg';
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
import { UserIcon } from '@core/component/UserIcon';
import { useUserId } from '@core/context/user';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { useContacts } from '@queries/contacts/contacts';
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
  buildContactLabel,
  type FilterCategory,
} from './unified-filter-dropdown';
import { NO_ASSIGNEE } from '@app/component/next-soup/filters';
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

const MENU_SHADOW_CLASS =
  'shadow-[inset_0_0_0_1px_var(--color-edge-muted),inset_0_2px_0_0_color-mix(in_oklch,var(--color-edge-muted)_85%,white),0_10px_28px_-18px_rgba(0,0,0,0.28),0_2px_8px_-6px_rgba(0,0,0,0.18)]';
const SELECT_CONTENT_CLASS = cn(
  'z-action-menu bg-surface rounded-xl min-w-[160px] px-1 pt-1.25 pb-1 border-0',
  MENU_SHADOW_CLASS
);
const SELECT_ITEM_CLASS =
  'group w-full flex items-center gap-2.5 py-1.5 pl-2 pr-4 text-left text-sm font-medium transition-colors text-ink/65 hover:text-ink focus:text-ink data-[highlighted]:text-ink hover:bg-ink/3 focus:bg-ink/3 data-[highlighted]:bg-ink/3 hover:shadow-[inset_0_0_0_1px_var(--color-edge-muted)] focus:shadow-[inset_0_0_0_1px_var(--color-edge-muted)] data-[highlighted]:shadow-[inset_0_0_0_1px_var(--color-edge-muted)] outline-none cursor-default rounded-lg';
const OPTION_ICON_CLASS =
  'size-4 flex items-center justify-center shrink-0 text-ink/65 opacity-70 group-hover:opacity-100 group-hover:text-ink group-focus:opacity-100 group-focus:text-ink group-data-[highlighted]:opacity-100 group-data-[highlighted]:text-ink [&>*]:size-3.5 [&_svg]:size-3.5';

const GroupOptionIcon = (props: { option: GroupOption }) => {
  const iconClass = 'size-3.5';
  const value = () => props.option.value;

  return (
    <span class={OPTION_ICON_CLASS}>
      <Show when={value() === 'none'}>
        <CircleDashedIcon class={iconClass} />
      </Show>
      <Show when={value() === 'date'}>
        <CalendarIcon class={iconClass} />
      </Show>
      <Show when={value() === 'entity_type'}>
        <TagIcon class={iconClass} />
      </Show>
      <Show when={value() === 'project'}>
        <FolderIcon class={iconClass} />
      </Show>
      <Show when={value() === `property:${SYSTEM_PROPERTY_IDS.STATUS}`}>
        <StatusInProgress class={iconClass} />
      </Show>
      <Show when={value() === `property:${SYSTEM_PROPERTY_IDS.PRIORITY}`}>
        <PriorityHigh class={iconClass} />
      </Show>
      <Show when={value() === `property:${SYSTEM_PROPERTY_IDS.ASSIGNEES}`}>
        <UsersIcon class={iconClass} />
      </Show>
    </span>
  );
};

export const ViewOptionsPopover: Component = () => {
  const [open, setOpen] = createSignal(false);
  const soup = useSoup();
  const {
    soup: soupView,
    queryFilters,
    assigneeFilter,
    setAssigneeFilter,
  } = useSoupView();
  const panel = useSplitPanelOrThrow();
  const contacts = useContacts();
  const userId = useUserId();
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

  const assigneeOptions = createMemo(() => {
    const currentUserId = userId();
    return [
      {
        id: NO_ASSIGNEE,
        label: 'Unassigned',
        icon: () => <CircleDashedIcon class="size-3.5 text-ink-muted" />,
      },
      ...contacts().map((contact) => ({
        id: contact.id,
        label: buildContactLabel(contact, currentUserId),
        icon: () => (
          <UserIcon
            id={contact.id}
            size="sm"
            suppressClick
            showTooltip={false}
          />
        ),
      })),
    ];
  });

  const toggleAssignee = (id: string) => {
    const current = assigneeFilter();
    const next = current.includes(id)
      ? current.filter((assigneeId) => assigneeId !== id)
      : [...current, id];

    batch(() => {
      setAssigneeFilter(next);

      const shouldBeActive = next.length > 0;
      if (shouldBeActive !== soupView.predicates.isActive('assignee')) {
        soupView.predicates.toggle({ and: ['assignee'] });
      }

      if (id === NO_ASSIGNEE) return;

      const query = {
        include: {
          properties: [
            {
              propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
              type: 'entity' as const,
              value: id,
            },
          ],
        },
      };

      if (current.includes(id)) queryFilters.remove(query);
      else queryFilters.add(query);
    });
  };

  const hasActiveOptions = createMemo(() => {
    return (
      activeFilterCount() > 0 ||
      assigneeFilter().length > 0 ||
      hasActiveSearchIndex() ||
      isPreviewActive()
    );
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
    <Popover
      open={open()}
      onOpenChange={setOpen}
      placement="bottom-end"
      gutter={4}
    >
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
          <Popover.Content
            class={cn(
              'z-action-menu bg-surface rounded-xl min-w-[220px] p-2 flex flex-col gap-2 border-0',
              MENU_SHADOW_CLASS
            )}
          >
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
            <Show when={currentView() === 'tasks'}>
              <AssigneeFilterDropdown
                options={assigneeOptions()}
                activeIds={assigneeFilter}
                toggleAssignee={toggleAssignee}
              />
            </Show>

            {/* Sort Section */}
            <div class="flex items-center justify-between gap-3">
              <span class="text-xs text-ink-muted">Sort</span>
              <DropdownMenu placement="bottom-end" gutter={4}>
                <DropdownMenu.Trigger
                  class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm bg-ink/5 hover:bg-ink/10 focus:bg-ink/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors"
                  tabIndex={0}
                >
                  <span class="text-ink">{currentSortLabel()}</span>
                  <CaretDownIcon class="size-3 text-ink-muted" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <Layer depth={3}>
                    <DropdownMenu.Content class={SELECT_CONTENT_CLASS}>
                      <For each={sortOptions()}>
                        {(option) => (
                          <DropdownMenu.Item
                            class={SELECT_ITEM_CLASS}
                            onSelect={() => onSortChange(option.value)}
                          >
                            <span
                              class={cn(
                                'flex-1 truncate',
                                sortValue() === option.value &&
                                  'text-ink font-medium'
                              )}
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
                    <DropdownMenu.Content class={SELECT_CONTENT_CLASS}>
                      <For each={groupOptions()}>
                        {(option) => (
                          <DropdownMenu.Item
                            class={SELECT_ITEM_CLASS}
                            onSelect={() => onGroupChange(option.value)}
                          >
                            <GroupOptionIcon option={option} />
                            <span
                              class={cn(
                                'flex-1 truncate',
                                groupValue() === option.value &&
                                  'text-ink font-medium'
                              )}
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
                    isPreviewActive()
                      ? 'translate-x-3 bg-accent'
                      : 'translate-x-0 bg-ink-muted'
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

const AssigneeFilterDropdown: Component<{
  options: Array<{
    id: string;
    label: string;
    icon?: () => JSX.Element;
  }>;
  activeIds: Accessor<string[]>;
  toggleAssignee: (id: string) => void;
}> = (props) => {
  const activeCount = createMemo(() => props.activeIds().length);
  const activeLabel = createMemo(() => {
    const active = props.options.filter((option) =>
      props.activeIds().includes(option.id)
    );
    if (active.length === 0) return 'All';
    if (active.length === 1) return active[0].label;
    return `${active.length} selected`;
  });

  return (
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-ink-muted">Assignee</span>
        <Show when={activeCount() > 0}>
          <span class="size-1.5 rounded-full bg-accent" />
        </Show>
      </div>
      <DropdownMenu placement="bottom-end" gutter={4}>
        <DropdownMenu.Trigger
          class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm bg-ink/5 hover:bg-ink/10 focus:bg-ink/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors"
          tabIndex={0}
        >
          <span class={activeCount() > 0 ? 'text-ink' : 'text-ink-muted'}>
            {activeLabel()}
          </span>
          <CaretDownIcon class="size-3 text-ink-muted" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <Layer depth={3}>
            <DropdownMenu.Content class={SELECT_CONTENT_CLASS}>
              <For each={props.options}>
                {(option) => {
                  const active = () => props.activeIds().includes(option.id);
                  return (
                    <DropdownMenu.Item
                      class={SELECT_ITEM_CLASS}
                      onSelect={() => props.toggleAssignee(option.id)}
                      closeOnSelect={false}
                    >
                      <span
                        class={cn(
                          'size-4 flex items-center justify-center shrink-0 rounded border transition-colors opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-data-[highlighted]:opacity-100',
                          active()
                            ? 'opacity-100 bg-accent border-accent'
                            : 'border-edge-muted'
                        )}
                      >
                        <Show when={active()}>
                          <CheckIcon class="size-2.5 text-surface" />
                        </Show>
                      </span>
                      <Show when={option.icon}>
                        {(icon) => (
                          <span class={OPTION_ICON_CLASS}>{icon()()}</span>
                        )}
                      </Show>
                      <span
                        class={cn('flex-1 truncate', active() && 'text-ink')}
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

const FilterCategoryDropdown: Component<{
  category: FilterCategory;
  isOptionActive: (id: string) => boolean;
  toggleFilter: (id: string) => void;
}> = (props) => {
  const activeCount = createMemo(() => {
    return props.category.options.filter((o) => props.isOptionActive(o.id))
      .length;
  });

  const activeLabel = createMemo(() => {
    const active = props.category.options.filter((o) =>
      props.isOptionActive(o.id)
    );
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
        <DropdownMenu.Trigger
          class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm bg-ink/5 hover:bg-ink/10 focus:bg-ink/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition-colors"
          tabIndex={0}
        >
          <span class={activeCount() > 0 ? 'text-ink' : 'text-ink-muted'}>
            {activeLabel()}
          </span>
          <CaretDownIcon class="size-3 text-ink-muted" />
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <Layer depth={3}>
            <DropdownMenu.Content class={SELECT_CONTENT_CLASS}>
              <For each={props.category.options}>
                {(option) => {
                  const active = () => props.isOptionActive(option.id);
                  return (
                    <DropdownMenu.Item
                      class={SELECT_ITEM_CLASS}
                      onSelect={() => props.toggleFilter(option.id)}
                      closeOnSelect={!props.category.multiple}
                    >
                      <span
                        class={cn(
                          'size-4 flex items-center justify-center shrink-0 rounded border transition-colors opacity-0 group-hover:opacity-100 group-focus:opacity-100 group-data-[highlighted]:opacity-100',
                          active()
                            ? 'opacity-100 bg-accent border-accent'
                            : 'border-edge-muted'
                        )}
                      >
                        <Show when={active()}>
                          <CheckIcon class="size-2.5 text-surface" />
                        </Show>
                      </span>
                      <Show when={option.icon}>
                        {(icon) => (
                          <span class={OPTION_ICON_CLASS}>{icon()()}</span>
                        )}
                      </Show>
                      <span
                        class={cn('flex-1 truncate', active() && 'text-ink')}
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
