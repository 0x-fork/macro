import { NO_ASSIGNEE } from '@app/component/next-soup/filters/configs/';
import {
  type ReadFilter,
  useSoupView,
} from '@app/component/next-soup/soup-view/soup-view-context';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { isListViewID } from '@app/constants/list-views';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { UserIcon } from '@core/component/UserIcon';
import {
  ENABLE_NEW_INBOX_FLAG,
  ENABLE_NEW_INBOX_OVERRIDE,
} from '@core/constant/featureFlags';
import { useUserId } from '@core/context/user';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import CircleDashedIcon from '@phosphor/circle-dashed.svg';
import FilterIcon from '@phosphor/funnel-simple.svg';
import { useGithubLinkStatusQuery } from '@queries/auth';
import { useContacts } from '@queries/contacts/contacts';
import { cn, Dropdown, Tooltip } from '@ui';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { buildContactLabel, VIEW_FACETS } from './facet-views';
import {
  SearchableMultiSelectInline,
  type SearchableOption,
} from './searchable-multi-select';
import { useTagFilter } from './tag-filter';

export const TypeIndicator = (props: { active: boolean }) => (
  <span
    class={cn(
      'size-3.5 flex items-center justify-center shrink-0 rounded-sm border text-surface',
      props.active
        ? 'bg-accent border-accent'
        : 'border-transparent group-hover:not-hover:border-edge-muted group-data-highlighted:not-hover:border-edge-muted hover:border-accent'
    )}
  >
    <Show when={props.active}>
      <CheckIcon class="size-2.5" />
    </Show>
  </span>
);

// Sub-trigger rows differ from default Dropdown.Item only by
// distributing label + caret to the row ends.
// const FILTER_MENU_SUBTRIGGER_CLASS = 'justify-between gap-2';

/** Searchable submenu for filters with many options like assignees */
const SearchableFilterSubmenu = (props: {
  label: string;
  options: Accessor<SearchableOption[]>;
  activeIds: Accessor<string[]>;
  onChange: (ids: string[]) => void;
  placeholder?: string;
  open?: Accessor<boolean>;
  onOpenChange?: (v: boolean) => void;
}) => {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const isOpen = () => props.open?.() ?? internalOpen();
  const setIsOpen = (v: boolean) => {
    if (props.onOpenChange) props.onOpenChange(v);
    else setInternalOpen(v);
  };
  const [inputRef, setInputRef] = createSignal<HTMLInputElement>();

  // Focus the search input while the sub is open.
  //
  // Two issues conspire:
  //   1. Initial focus has to wait for Kobalte's DismissableLayer to register
  //      itself as a nested layer of the parent menu (done in its onMount).
  //      The sub is portaled, so focusing the input before that registration
  //      looks like "focus outside" to the parent and closes the whole menu
  //      tree. One rAF is enough to get past those onMount callbacks.
  //   2. After that, Kobalte's `onPointerMove` on the SubTrigger keeps
  //      calling `focusWithoutScrolling(e.currentTarget)` on every mouse
  //      move, stealing focus back to the trigger. Reclaim on blur — user
  //      dismissal routes (Escape / click-outside) close the sub first,
  //      which unregisters this listener before focus moves elsewhere.
  createEffect(() => {
    const el = inputRef();
    if (!isOpen() || !el) return;

    const raf = requestAnimationFrame(() => {
      if (isOpen()) el.focus();
    });

    const onBlur = () => {
      queueMicrotask(() => {
        if (isOpen() && document.activeElement !== el) el.focus();
      });
    };
    el.addEventListener('blur', onBlur);

    onCleanup(() => {
      cancelAnimationFrame(raf);
      el.removeEventListener('blur', onBlur);
    });
  });

  return (
    <Dropdown.Sub open={isOpen()} onOpenChange={setIsOpen}>
      <Dropdown.SubTrigger
        onPointerEnter={(e: PointerEvent & { currentTarget: HTMLElement }) => {
          // Kobalte's "grace polygon" keeps an open sub alive when the
          // pointer crosses toward its content. For sibling In/From triggers,
          // that means moving between them leaves the prior sub stuck open
          // and the prior trigger stuck with data-highlighted. Force focus
          // + open so Kobalte's parent selection manager updates to this
          // trigger and the shared signal closes the sibling.
          if (e.pointerType !== 'mouse') return;
          e.currentTarget.focus({ preventScroll: true });
          if (!isOpen()) setIsOpen(true);
        }}
      >
        <span class="text-ink">{props.label}</span>
        <CaretRightIcon class="size-3 text-ink-muted" />
      </Dropdown.SubTrigger>

      <Dropdown.SubContent class="w-65 max-w-[90vw]">
        <Dropdown.Group class="p-0 gap-0">
          <SearchableMultiSelectInline
            onRequestClose={() => setIsOpen(false)}
            placeholder={props.placeholder}
            activeIds={props.activeIds}
            onChange={props.onChange}
            options={props.options}
            inputRef={setInputRef}
          />
        </Dropdown.Group>
      </Dropdown.SubContent>
    </Dropdown.Sub>
  );
};

interface UnifiedFilterDropdownProps {
  /** Optional controlled open state */
  open?: Accessor<boolean>;
  onOpenChange?: (open: boolean) => void;
  /** Optional custom trigger element. If not provided, uses default Filter button. */
  customTrigger?: JSX.Element;
  /** Hide the default trigger entirely (useful when controlling open state externally) */
  hideTrigger?: boolean;
}

const READ_FILTER_OPTIONS: { id: ReadFilter; label: string }[] = [
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'all', label: 'All' },
];

/** Single-select read/unread/all submenu for the inbox. */
const ReadStatusSubmenu = (props: {
  value: ReadFilter;
  onChange: (value: ReadFilter) => void;
}) => {
  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger>
        <span class="text-ink">Status</span>
        <CaretRightIcon class="size-3 text-ink-muted" />
      </Dropdown.SubTrigger>

      <Dropdown.SubContent>
        <Dropdown.Group>
          <For each={READ_FILTER_OPTIONS}>
            {(option) => {
              const active = () => props.value === option.id;
              return (
                <Dropdown.Item
                  onSelect={() => props.onChange(option.id)}
                  closeOnSelect
                >
                  <TypeIndicator active={active()} />
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
};

export const UnifiedFilterDropdown = (
  props: UnifiedFilterDropdownProps = {}
) => {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const open = () => props.open?.() ?? internalOpen();
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    props.onOpenChange?.(v);
  };
  const panel = useSplitPanelOrThrow();
  const { soup, assigneeFilter, setAssigneeFilter, readFilter, setReadFilter } =
    useSoupView();
  const contacts = useContacts();
  const userId = useUserId();

  const currentView = createMemo((): ListView | undefined => {
    const content = panel.handle.content();
    if (content.type !== 'component' || !isListViewID(content.id))
      return undefined;
    return content.id;
  });

  const newInboxFlag = useFeatureFlag(ENABLE_NEW_INBOX_FLAG, {
    enabledOverride: ENABLE_NEW_INBOX_OVERRIDE,
  });
  const isNewInbox = () => currentView() === 'inbox' && newInboxFlag().enabled;

  const githubLinkStatus = useGithubLinkStatusQuery({
    enabled: () => currentView() === 'inbox',
  });

  const categories = createMemo(() => {
    const view = currentView();
    if (!view) return [];

    const cats = VIEW_FACETS[view] ?? [];

    // The GitHub PRs option is only meaningful once GitHub is linked.
    if (view !== 'inbox' || githubLinkStatus.data?.status === 'linked') {
      return cats;
    }

    return cats.map((category) =>
      category.id === 'entity-type'
        ? {
            ...category,
            options: category.options.filter((o) => o.id !== 'github-pr'),
          }
        : category
    );
  });

  const isOptionActive = (facetId: string, optionId: string) =>
    soup.facets.has(facetId, optionId);

  const toggleFilter = (facetId: string, optionId: string) =>
    soup.facets.toggle(facetId, optionId);

  // Assignee options for tasks view
  const assigneeOptions = createMemo((): SearchableOption[] => {
    const currentUserId = userId();
    const noAssigneeOption: SearchableOption = {
      id: NO_ASSIGNEE,
      label: 'Unassigned',
      icon: () => <CircleDashedIcon class="size-3.5 text-ink-muted" />,
    };
    let meOption: SearchableOption | undefined;
    const otherContactOptions: SearchableOption[] = [];
    for (const contact of contacts()) {
      const opt: SearchableOption = {
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
      };
      if (contact.id === currentUserId) {
        meOption = opt;
      } else {
        otherContactOptions.push(opt);
      }
    }
    return [
      ...(meOption ? [meOption] : []),
      noAssigneeOption,
      ...otherContactOptions,
    ];
  });

  const handleAssigneeChange = (ids: string[]) => setAssigneeFilter(ids);

  const isTasksView = () => currentView() === 'tasks';
  const isDocumentsView = () => currentView() === 'documents';

  const tagFilter = useTagFilter();
  const showTagsFilter = () =>
    tagFilter.enabled() &&
    tagFilter.hasTags() &&
    (isTasksView() || isDocumentsView());

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

  // Capture anchor position when menu opens to prevent jumping when chips are added
  const [anchorRect, setAnchorRect] = createSignal<DOMRect | null>(null);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      // Clear any stale anchor rect so it gets recaptured from trigger
      setAnchorRect(null);
    }
    setOpen(isOpen);
  };

  const getAnchorRect = (anchor?: HTMLElement) => {
    // If we have a captured rect, use it (prevents jumping)
    const captured = anchorRect();
    if (captured) return captured;

    // Otherwise capture the current position
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      setAnchorRect(rect);
      return rect;
    }
    return undefined;
  };

  return (
    <Show
      when={
        categories().length > 0 ||
        isTasksView() ||
        isNewInbox() ||
        showTagsFilter()
      }
    >
      <Dropdown
        open={open()}
        onOpenChange={handleOpenChange}
        getAnchorRect={getAnchorRect}
      >
        <Show when={!props.hideTrigger}>
          <Switch>
            <Match when={props.customTrigger}>{props.customTrigger}</Match>
            <Match when={true}>
              <Tooltip label="Filter" hotkey={TOKENS.soup.filter}>
                <Dropdown.Trigger depth={2} class="bg-surface">
                  <FilterIcon />
                  <span>Filter</span>
                </Dropdown.Trigger>
              </Tooltip>
            </Match>
          </Switch>
        </Show>

        <Dropdown.Content class="shadow-menu">
          <Dropdown.Group>
            <Show when={isNewInbox()}>
              <ReadStatusSubmenu
                value={readFilter()}
                onChange={setReadFilter}
              />
            </Show>
            <Show
              when={
                categories().length === 1 && !isTasksView() && !isNewInbox()
              }
              fallback={
                <>
                  <For each={categories()}>
                    {(category) => (
                      <Dropdown.Sub>
                        <Dropdown.SubTrigger>
                          <span class="text-ink">{category.label}</span>
                          <CaretRightIcon class="size-3 text-ink-muted" />
                        </Dropdown.SubTrigger>

                        <Dropdown.SubContent>
                          <Dropdown.Group>
                            <For each={category.options}>
                              {(option) => {
                                const active = () =>
                                  isOptionActive(category.id, option.id);
                                return (
                                  <Dropdown.Item
                                    onSelect={() =>
                                      toggleFilter(category.id, option.id)
                                    }
                                    closeOnSelect={!category.multiple}
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
                    )}
                  </For>

                  {/* Assignee filter for tasks view */}
                  <Show when={isTasksView()}>
                    <SearchableFilterSubmenu
                      label="Assignee"
                      options={assigneeOptions}
                      activeIds={assigneeFilter}
                      onChange={handleAssigneeChange}
                      placeholder="Search assignees..."
                    />
                  </Show>
                </>
              }
            >
              {/* Single category: render options directly */}
              <For each={categories()[0]!.options}>
                {(option) => {
                  const active = () =>
                    isOptionActive(categories()[0]!.id, option.id);
                  return (
                    <Dropdown.Item
                      onSelect={() =>
                        toggleFilter(categories()[0]!.id, option.id)
                      }
                      closeOnSelect={!categories()[0]!.multiple}
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
            </Show>

            <Show when={showTagsFilter()}>
              <SearchableFilterSubmenu
                label="Tags"
                options={tagFilter.options}
                activeIds={tagFilter.activeIds}
                onChange={tagFilter.onChange}
                placeholder="Filter by tag..."
              />
            </Show>
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );
};
