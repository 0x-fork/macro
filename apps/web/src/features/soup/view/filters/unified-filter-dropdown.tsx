import { SearchableMultiSelectInline } from '@app/features/soup/view/components/searchable-multi-select';
import { useSoupView } from '@app/features/soup/view/context';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import FilterIcon from '@phosphor/funnel-simple.svg';
import { cn, Dropdown, Tooltip } from '@ui';
import {
  type Accessor,
  createEffect,
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { useIsNewInbox } from '../primitives/use-is-new-inbox';
import {
  type SoupFacetControl,
  useSoupFacetControls,
} from './use-soup-facet-controls';

const TypeIndicator = (props: { active: boolean }) => (
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

export type UnifiedFilterDropdownProps = {
  open?: Accessor<boolean>;
  onOpenChange?: (open: boolean) => void;
  customTrigger?: JSX.Element;
  hideTrigger?: boolean;
  registerHotkey?: boolean;
};

const selectOption = (control: SoupFacetControl, optionId: string) => {
  const activeIds = control.activeIds();
  if (!control.multiple) {
    control.onChange(activeIds.includes(optionId) ? [] : [optionId]);
    return;
  }
  control.onChange(
    activeIds.includes(optionId)
      ? activeIds.filter((id) => id !== optionId)
      : [...activeIds, optionId]
  );
};

function FacetOptions(props: { control: SoupFacetControl }) {
  return (
    <For each={props.control.options()}>
      {(option) => {
        const active = () => props.control.activeIds().includes(option.id);
        return (
          <Dropdown.Item
            onSelect={() => selectOption(props.control, option.id)}
            closeOnSelect={!props.control.multiple}
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
  );
}

function SearchableFilterSubmenu(props: { control: SoupFacetControl }) {
  const [open, setOpen] = createSignal(false);
  const [inputRef, setInputRef] = createSignal<HTMLInputElement>();

  createEffect(() => {
    const input = inputRef();
    if (!open() || !input) return;

    const frame = requestAnimationFrame(() => {
      if (open()) input.focus();
    });
    const reclaimFocus = () => {
      queueMicrotask(() => {
        if (open() && document.activeElement !== input) input.focus();
      });
    };
    input.addEventListener('blur', reclaimFocus);
    onCleanup(() => {
      cancelAnimationFrame(frame);
      input.removeEventListener('blur', reclaimFocus);
    });
  });

  return (
    <Dropdown.Sub open={open()} onOpenChange={setOpen}>
      <Dropdown.SubTrigger
        onPointerEnter={(
          event: PointerEvent & {
            currentTarget: HTMLElement;
          }
        ) => {
          if (event.pointerType !== 'mouse') return;
          event.currentTarget.focus({ preventScroll: true });
          if (!open()) setOpen(true);
        }}
      >
        <span class="text-ink">{props.control.label}</span>
        <CaretRightIcon class="size-3 text-ink-muted" />
      </Dropdown.SubTrigger>
      <Dropdown.SubContent class="w-65 max-w-[90vw]">
        <Dropdown.Group class="p-0 gap-0">
          <SearchableMultiSelectInline
            onRequestClose={() => setOpen(false)}
            placeholder={props.control.placeholder}
            activeIds={props.control.activeIds}
            onChange={props.control.onChange}
            options={props.control.options}
            inputRef={setInputRef}
            preserveOrder={props.control.preserveOrder}
          />
        </Dropdown.Group>
      </Dropdown.SubContent>
    </Dropdown.Sub>
  );
}

type InboxReadFilter = 'all' | 'unread' | 'read';

const INBOX_READ_FILTER_OPTIONS: {
  id: InboxReadFilter;
  label: string;
}[] = [
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
  { id: 'all', label: 'All' },
];

function InboxReadStatusSubmenu(props: {
  value: InboxReadFilter;
  onChange: (value: InboxReadFilter) => void;
}) {
  return (
    <Dropdown.Sub>
      <Dropdown.SubTrigger>
        <span class="text-ink">Status</span>
        <CaretRightIcon class="size-3 text-ink-muted" />
      </Dropdown.SubTrigger>
      <Dropdown.SubContent>
        <Dropdown.Group>
          <For each={INBOX_READ_FILTER_OPTIONS}>
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
}

function FacetSubmenu(props: { control: SoupFacetControl }) {
  return (
    <Show
      when={props.control.searchable}
      fallback={
        <Dropdown.Sub>
          <Dropdown.SubTrigger>
            <span class="text-ink">{props.control.label}</span>
            <CaretRightIcon class="size-3 text-ink-muted" />
          </Dropdown.SubTrigger>
          <Dropdown.SubContent>
            <Dropdown.Group>
              <FacetOptions control={props.control} />
            </Dropdown.Group>
          </Dropdown.SubContent>
        </Dropdown.Sub>
      }
    >
      <SearchableFilterSubmenu control={props.control} />
    </Show>
  );
}

export function UnifiedFilterDropdown(props: UnifiedFilterDropdownProps = {}) {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const open = () => props.open?.() ?? internalOpen();
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    props.onOpenChange?.(next);
  };
  const panel = useSplitPanelOrThrow();
  const { collection } = useSoupView();
  const controls = useSoupFacetControls();
  const isNewInbox = useIsNewInbox();
  const hotkeys = createHotkeyGroup();

  if (props.registerHotkey !== false) {
    registerHotkey({
      hotkey: 'f',
      scopeId: panel.splitHotkeyScope,
      description: 'Open filter menu',
      hotkeyToken: TOKENS.soup.filter,
      keyDownHandler: () => {
        setOpen(true);
        return true;
      },
    }).withGroup(hotkeys);
  }
  onCleanup(() => hotkeys.dispose());

  const inboxReadFilter = (): InboxReadFilter => {
    if (collection.facets.has('read_state', 'read')) return 'read';
    if (collection.facets.has('read_state', 'unread')) return 'unread';
    return 'all';
  };
  const setInboxReadFilter = (value: InboxReadFilter) => {
    collection.facets.set('read_state', value === 'all' ? [] : [value]);
  };

  const directControl = () => {
    const available = controls();
    return available.length === 1 && !available[0]?.searchable && !isNewInbox()
      ? available[0]
      : undefined;
  };

  // Preserve the trigger's position while changing filters adds/removes chips.
  const [anchorRect, setAnchorRect] = createSignal<DOMRect | null>(null);
  const handleOpenChange = (next: boolean) => {
    if (next) setAnchorRect(null);
    setOpen(next);
  };
  const getAnchorRect = (anchor?: HTMLElement) => {
    const captured = anchorRect();
    if (captured) return captured;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setAnchorRect(rect);
    return rect;
  };

  return (
    <Show when={controls().length > 0 || isNewInbox()}>
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
              <InboxReadStatusSubmenu
                value={inboxReadFilter()}
                onChange={setInboxReadFilter}
              />
            </Show>
            <Show
              when={directControl()}
              fallback={
                <For each={controls()}>
                  {(control) => <FacetSubmenu control={control} />}
                </For>
              }
            >
              {(control) => <FacetOptions control={control()} />}
            </Show>
          </Dropdown.Group>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );
}
