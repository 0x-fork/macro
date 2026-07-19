import { SearchableMultiSelect } from '@app/features/next-soup/soup-view/filters-bar/searchable-multi-select';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { Combobox } from '@kobalte/core/combobox';
import XIcon from '@phosphor/x.svg';
import { Button, Dropdown, Layer, SingleSelectCheck } from '@ui';
import {
  type Accessor,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from 'solid-js';
import type {
  SearchFacet,
  SearchFacetMode,
  SearchFacetOption,
} from './search-facets';

type SearchFacetChipProps = {
  facet: SearchFacet;
  open?: Accessor<boolean>;
  setOpen?: (open: boolean) => void;
};

const ChipDivider = () => (
  <div class="w-px self-stretch bg-edge-muted shrink-0" />
);

const ValueDisplay = (props: { values: SearchFacetOption[] }) => {
  const first = () => props.values[0];
  const overflowCount = () => props.values.length - 1;
  return (
    <span
      class="inline-flex h-full items-center gap-1.5"
      title={props.values.map((value) => value.label).join(', ')}
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
  facet: Extract<SearchFacet, { kind: 'single' }>;
  open?: Accessor<boolean>;
  setOpen?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = createSignal(false);
  const open = () => props.open?.() ?? internalOpen();
  const setOpen = (next: boolean) => (props.setOpen ?? setInternalOpen)(next);

  return (
    <Dropdown open={open()} onOpenChange={setOpen}>
      <Dropdown.Trigger
        variant="ghost"
        class="inline-flex items-center gap-1.5 px-2 h-auto! hover:bg-ink/5 active:bg-ink/8 rounded-none"
      >
        <ValueDisplay values={props.facet.values()} />
      </Dropdown.Trigger>
      <Dropdown.Content class="shadow-menu">
        <Dropdown.Group>
          <For each={props.facet.options}>
            {(option) => (
              <Dropdown.Item
                onSelect={() => props.facet.onSelect(option.id)}
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
                  active={props.facet.selectedId() === option.id}
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

const ModeSegment = (props: { mode: SearchFacetMode }) => (
  <Dropdown>
    <Dropdown.Trigger
      variant="ghost"
      class="inline-flex items-center px-2 h-auto! text-ink-muted hover:bg-ink/5 active:bg-ink/8 rounded-none"
    >
      {MODE_OPTIONS.find((option) => option.id === props.mode.value())?.label}
    </Dropdown.Trigger>
    <Dropdown.Content class="shadow-menu">
      <Dropdown.Group>
        <For each={MODE_OPTIONS}>
          {(option) => (
            <Dropdown.Item
              onSelect={() => props.mode.onSelect(option.id)}
              closeOnSelect
            >
              <span class="flex-1 truncate">{option.label}</span>
              <SingleSelectCheck active={props.mode.value() === option.id} />
            </Dropdown.Item>
          )}
        </For>
      </Dropdown.Group>
    </Dropdown.Content>
  </Dropdown>
);

function MultiValueSegment(props: {
  facet: Extract<SearchFacet, { kind: 'multi' }>;
}) {
  const panel = useSplitPanelOrThrow();
  const [open, setOpen] = createSignal(false);
  return (
    <SearchableMultiSelect
      options={props.facet.options}
      activeIds={props.facet.activeIds}
      onChange={props.facet.onChange}
      onOnly={props.facet.onOnly}
      placeholder={props.facet.placeholder}
      preserveOrder={props.facet.preserveOrder}
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
        <ValueDisplay values={props.facet.values()} />
      </Combobox.Trigger>
    </SearchableMultiSelect>
  );
}

export function SearchFacetChip(props: SearchFacetChipProps) {
  return (
    <Layer depth={2}>
      <div class="h-7 flex items-stretch text-xs whitespace-nowrap rounded-md bg-surface text-ink border border-edge-muted overflow-clip">
        <span class="inline-flex items-center px-2 text-ink-muted">
          {props.facet.label}
        </span>
        <ChipDivider />

        <Show
          when={
            props.facet.kind === 'multi' &&
            props.facet.mode?.visible() &&
            props.facet.mode
          }
        >
          {(mode) => (
            <>
              <ModeSegment mode={mode()} />
              <ChipDivider />
            </>
          )}
        </Show>

        <Switch>
          <Match when={props.facet.kind === 'single' && props.facet}>
            {(facet) => (
              <SingleValueSegment
                facet={facet() as Extract<SearchFacet, { kind: 'single' }>}
                open={props.open}
                setOpen={props.setOpen}
              />
            )}
          </Match>
          <Match when={props.facet.kind === 'multi' && props.facet}>
            {(facet) => (
              <MultiValueSegment
                facet={facet() as Extract<SearchFacet, { kind: 'multi' }>}
              />
            )}
          </Match>
        </Switch>

        <Show when={!props.facet.isDefault()}>
          <ChipDivider />
          <Button
            class="rounded-none h-full not-disabled:hover:text-failure"
            size="icon-sm"
            onClick={(event) => {
              event.stopPropagation();
              props.facet.reset();
            }}
          >
            <XIcon class="size-3.5!" />
          </Button>
        </Show>
      </div>
    </Layer>
  );
}
