import type { FilterOption } from '@app/features/soup/view/components/filters/facet-views';
import type { SoupFacetControl } from '@app/features/soup/view/components/filters/use-soup-facet-controls';
import { useSoupFacetControls } from '@app/features/soup/view/components/filters/use-soup-facet-controls';
import { SearchableMultiSelect } from '@app/features/soup/view/components/searchable-multi-select';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { Combobox } from '@kobalte/core/combobox';
import XIcon from '@phosphor/x.svg';
import { Button, Dropdown, Layer, SingleSelectCheck } from '@ui';
import {
  type Accessor,
  createSignal,
  For,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { useSoupView } from '../../context';

const ChipDivider = () => (
  <div class="w-px self-stretch bg-edge-muted shrink-0" />
);

const controlValues = (control: SoupFacetControl): FilterOption[] => {
  if (control.displayValues) return control.displayValues();
  const ids = control.activeIds();
  if (ids.length === 0) {
    return [{ id: 'all', label: control.neutralLabel ?? 'All' }];
  }
  const options = control.options();
  return ids.map(
    (id) =>
      options.find((candidate) => candidate.id === id) ?? { id, label: id }
  );
};

const controlIsDefault = (control: SoupFacetControl) =>
  control.isDefault?.() ?? control.activeIds().length === 0;

const ValueDisplay = (props: { control: SoupFacetControl }) => {
  const values = () => controlValues(props.control);
  const first = () => values()[0];
  const overflowCount = () => values().length - 1;
  return (
    <span
      class="inline-flex h-full items-center gap-1.5"
      title={values()
        .map((value) => value.label)
        .join(', ')}
    >
      <Show when={first()?.icon}>
        {(icon) => (
          <span class="size-4 flex items-center justify-center shrink-0">
            {icon()()}
          </span>
        )}
      </Show>
      <span class="truncate max-w-32">{first()?.label}</span>
      <Show when={overflowCount() > 0}>
        <span class="inline-flex items-center justify-center px-1 min-w-4 h-4 rounded-full bg-ink/10 text-xxs">
          +{overflowCount()}
        </span>
      </Show>
    </span>
  );
};

function SingleValueSegment(props: {
  control: SoupFacetControl;
  open?: Accessor<boolean>;
  setOpen?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const open = () => props.open?.() ?? internalOpen();
  const setOpen = (next: boolean) => (props.setOpen ?? setInternalOpen)(next);
  const options = () => [
    { id: 'all', label: props.control.neutralLabel ?? 'All' },
    ...props.control.options(),
  ];

  return (
    <Dropdown open={open()} onOpenChange={setOpen}>
      <Dropdown.Trigger
        variant="ghost"
        class="inline-flex items-center gap-1.5 px-2 h-auto! hover:bg-ink/5 active:bg-ink/8 rounded-none"
      >
        <ValueDisplay control={props.control} />
      </Dropdown.Trigger>
      <Dropdown.Content class="shadow-menu">
        <Dropdown.Group>
          <For each={options()}>
            {(option) => (
              <Dropdown.Item
                onSelect={() =>
                  props.control.onChange(option.id === 'all' ? [] : [option.id])
                }
                closeOnSelect
              >
                <Show when={option.icon}>
                  {(icon) => (
                    <span class="size-4 flex items-center justify-center shrink-0">
                      {icon()()}
                    </span>
                  )}
                </Show>
                <span class="flex-1 truncate">{option.label}</span>
                <SingleSelectCheck
                  active={(props.control.activeIds()[0] ?? 'all') === option.id}
                />
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
}

const MODE_OPTIONS: { id: 'any' | 'all'; label: string }[] = [
  { id: 'any', label: 'any of' },
  { id: 'all', label: 'all of' },
];

const ModeSegment = (props: { control: SoupFacetControl }) => {
  const value = () =>
    props.control.activeIds().includes('all') ? 'all' : 'any';
  return (
    <Dropdown>
      <Dropdown.Trigger
        variant="ghost"
        class="inline-flex items-center px-2 h-auto! text-ink-muted hover:bg-ink/5 active:bg-ink/8 rounded-none"
      >
        {MODE_OPTIONS.find((option) => option.id === value())?.label}
      </Dropdown.Trigger>
      <Dropdown.Content class="shadow-menu">
        <Dropdown.Group>
          <For each={MODE_OPTIONS}>
            {(option) => (
              <Dropdown.Item
                onSelect={() =>
                  props.control.onChange(option.id === 'all' ? ['all'] : [])
                }
                closeOnSelect
              >
                <span class="flex-1 truncate">{option.label}</span>
                <SingleSelectCheck active={value() === option.id} />
              </Dropdown.Item>
            )}
          </For>
        </Dropdown.Group>
      </Dropdown.Content>
    </Dropdown>
  );
};

function MultiValueSegment(props: { control: SoupFacetControl }) {
  const panel = useSplitPanelOrThrow();
  const [open, setOpen] = createSignal(false);
  return (
    <SearchableMultiSelect
      options={props.control.options}
      activeIds={props.control.activeIds}
      onChange={props.control.onChange}
      onOnly={props.control.onOnly ?? ((id) => props.control.onChange([id]))}
      placeholder={
        props.control.placeholder ??
        `Search ${props.control.label.toLowerCase()}...`
      }
      preserveOrder={props.control.preserveOrder}
      placement="bottom-start"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          queueMicrotask(() =>
            panel.panelRef()?.focus({ preventScroll: true })
          );
        }
      }}
    >
      <Combobox.Trigger class="inline-flex h-full items-center gap-1.5 px-2 hover:bg-hover active:bg-active">
        <ValueDisplay control={props.control} />
      </Combobox.Trigger>
    </SearchableMultiSelect>
  );
}

function SearchFacetChip(props: {
  control: SoupFacetControl;
  modeControl?: SoupFacetControl;
  open?: Accessor<boolean>;
  setOpen?: (open: boolean) => void;
}) {
  const reset = () => {
    (props.control.reset ?? (() => props.control.onChange([])))();
    if (props.control.id === 'tag') props.modeControl?.onChange([]);
  };
  const visibleMode = () =>
    props.control.id === 'tag' && props.control.activeIds().length >= 2
      ? props.modeControl
      : undefined;

  return (
    <Layer depth={2}>
      <div class="h-7 flex items-stretch text-xs whitespace-nowrap rounded-md bg-surface text-ink border border-edge-muted overflow-clip">
        <span class="inline-flex items-center px-2 text-ink-muted">
          {props.control.label}
        </span>
        <ChipDivider />

        <Show when={visibleMode()}>
          {(mode) => (
            <>
              <ModeSegment control={mode()} />
              <ChipDivider />
            </>
          )}
        </Show>

        <Switch>
          <Match when={!props.control.multiple}>
            <SingleValueSegment
              control={props.control}
              open={props.open}
              setOpen={props.setOpen}
            />
          </Match>
          <Match when={props.control.multiple}>
            <MultiValueSegment control={props.control} />
          </Match>
        </Switch>

        <Show when={!controlIsDefault(props.control)}>
          <ChipDivider />
          <Button
            class="rounded-none h-full not-disabled:hover:text-failure"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              reset();
            }}
          >
            <XIcon class="size-3.5!" />
          </Button>
        </Show>
      </div>
    </Layer>
  );
}

export function SoupSearchFacets() {
  const panel = useSplitPanelOrThrow();
  const { view } = useSoupView();
  const controls = useSoupFacetControls();
  const facets = () =>
    controls().filter((control) => control.id !== 'tag_mode');
  const modeControl = () =>
    controls().find((control) => control.id === 'tag_mode');
  const [typeMenuOpen, setTypeMenuOpen] = createSignal(false);
  const hotkeys = createHotkeyGroup();

  registerHotkey({
    hotkey: 'f',
    hotkeyToken: TOKENS.soup.filter,
    scopeId: panel.splitHotkeyScope,
    description: 'Filter by type',
    keyDownHandler: () => {
      setTypeMenuOpen(true);
      return true;
    },
  }).withGroup(hotkeys);
  onCleanup(() => hotkeys.dispose());

  return (
    <Show when={view() === 'search'}>
      <div class="flex items-center gap-1.5 flex-wrap min-w-0">
        <For each={facets()}>
          {(control) => (
            <SearchFacetChip
              control={control}
              modeControl={modeControl()}
              open={control.id === 'search_type' ? typeMenuOpen : undefined}
              setOpen={
                control.id === 'search_type' ? setTypeMenuOpen : undefined
              }
            />
          )}
        </For>
      </div>
    </Show>
  );
}
