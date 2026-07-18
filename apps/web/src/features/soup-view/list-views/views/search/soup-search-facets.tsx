import { SearchableMultiSelect } from '@app/features/next-soup/soup-view/filters-bar/searchable-multi-select';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { Combobox } from '@kobalte/core/combobox';
import XIcon from '@phosphor/x.svg';
import { Button, Dropdown, Layer, SingleSelectCheck } from '@ui';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { useSoupView } from '../../../context';
import {
  type SoupFacetControl,
  useSoupFacetControls,
} from '../../../filters/use-soup-facet-controls';

const selectedLabel = (control: SoupFacetControl) => {
  const ids = control.activeIds();
  if (ids.length === 0) return control.neutralLabel ?? 'All';
  const labels = ids.map(
    (id) => control.options().find((option) => option.id === id)?.label ?? id
  );
  return labels.length > 1 ? `${labels[0]} +${labels.length - 1}` : labels[0];
};

const Value = (props: { control: SoupFacetControl }) => (
  <span class="inline-flex max-w-40 items-center gap-1.5 truncate px-2">
    <Show
      when={
        props.control
          .options()
          .find((option) => option.id === props.control.activeIds()[0])?.icon
      }
    >
      {(icon) => <span class="size-4 shrink-0">{icon()()}</span>}
    </Show>
    <span class="truncate">{selectedLabel(props.control)}</span>
  </span>
);

function FacetValuePicker(props: {
  control: SoupFacetControl;
  open?: () => boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const toggle = (id: string) => {
    const selected = props.control.activeIds();
    if (!props.control.multiple) {
      props.control.onChange([id]);
      return;
    }
    props.control.onChange(
      selected.includes(id)
        ? selected.filter((selectedId) => selectedId !== id)
        : [...selected, id]
    );
  };

  return (
    <Show
      when={props.control.searchable}
      fallback={
        <Dropdown
          placement="bottom-start"
          open={props.open?.()}
          onOpenChange={props.onOpenChange}
        >
          <Dropdown.Trigger class="h-full rounded-none hover:bg-hover">
            <Value control={props.control} />
          </Dropdown.Trigger>
          <Dropdown.Content class="shadow-menu">
            <Dropdown.Group>
              <For each={props.control.options()}>
                {(option) => (
                  <Dropdown.Item
                    closeOnSelect={!props.control.multiple}
                    onSelect={() => toggle(option.id)}
                  >
                    <Show when={option.icon}>{(icon) => icon()()}</Show>
                    <span class="flex-1 truncate">{option.label}</span>
                    <SingleSelectCheck
                      active={props.control.activeIds().includes(option.id)}
                    />
                  </Dropdown.Item>
                )}
              </For>
            </Dropdown.Group>
          </Dropdown.Content>
        </Dropdown>
      }
    >
      <SearchableMultiSelect
        options={props.control.options}
        activeIds={props.control.activeIds}
        onChange={props.control.onChange}
        placeholder={props.control.placeholder}
        preserveOrder={props.control.preserveOrder}
        placement="bottom-start"
      >
        <Combobox.Trigger class="flex h-full items-center hover:bg-hover">
          <Value control={props.control} />
        </Combobox.Trigger>
      </SearchableMultiSelect>
    </Show>
  );
}

export function SoupSearchFacets() {
  const panel = useSplitPanelOrThrow();
  const view = useSoupView().view;
  const controls = useSoupFacetControls();
  const [typeOpen, setTypeOpen] = createSignal(false);
  const hotkeys = createHotkeyGroup();
  registerHotkey({
    hotkey: 'f',
    hotkeyToken: TOKENS.soup.filter,
    scopeId: panel.splitHotkeyScope,
    description: 'Filter by type',
    keyDownHandler: () => {
      setTypeOpen(true);
      return true;
    },
  }).withGroup(hotkeys);
  onCleanup(() => hotkeys.dispose());

  return (
    <Show when={view() === 'search'}>
      <div class="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-hidden">
        <For each={controls()}>
          {(control) => (
            <Layer depth={2}>
              <div class="flex h-7 shrink-0 items-stretch overflow-hidden rounded-md border border-edge-muted bg-surface text-xs">
                <span class="flex items-center px-2 text-ink-muted">
                  {control.label}
                </span>
                <div class="w-px bg-edge-muted" />
                <FacetValuePicker
                  control={control}
                  open={control.id === 'search_type' ? typeOpen : undefined}
                  onOpenChange={
                    control.id === 'search_type' ? setTypeOpen : undefined
                  }
                />
                <Show when={control.activeIds().length > 0}>
                  <div class="w-px bg-edge-muted" />
                  <Button
                    size="icon-sm"
                    class="h-full rounded-none hover:text-failure"
                    label={`Clear ${control.label}`}
                    onClick={() => control.onChange([])}
                  >
                    <XIcon class="size-3" />
                  </Button>
                </Show>
              </div>
            </Layer>
          )}
        </For>
      </div>
    </Show>
  );
}
