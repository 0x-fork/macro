import { SearchableMultiSelectInline } from '@app/features/next-soup/soup-view/filters-bar/searchable-multi-select';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import FilterIcon from '@phosphor/funnel-simple.svg';
import PlusIcon from '@phosphor/plus.svg';
import { cn, Dropdown } from '@ui';
import { createSignal, For, onCleanup, Show } from 'solid-js';
import { useSoupFacetControls } from './use-soup-facet-controls';

const SelectionIndicator = (props: { active: boolean }) => (
  <span
    class={cn(
      'flex size-3.5 shrink-0 items-center justify-center rounded-sm border',
      props.active
        ? 'border-accent bg-accent text-surface'
        : 'border-edge-muted'
    )}
  >
    <Show when={props.active}>
      <CheckIcon class="size-2.5" />
    </Show>
  </span>
);

export function SoupFacetFilter(
  props: { variant?: 'default' | 'add'; registerHotkey?: boolean } = {}
) {
  const panel = useSplitPanelOrThrow();
  const controls = useSoupFacetControls();
  const [open, setOpen] = createSignal(false);
  const hotkeys = createHotkeyGroup();
  if (props.registerHotkey !== false) {
    registerHotkey({
      hotkey: 'f',
      hotkeyToken: TOKENS.soup.filter,
      scopeId: panel.splitHotkeyScope,
      description: 'Open filter menu',
      keyDownHandler: () => {
        setOpen(true);
        return true;
      },
    }).withGroup(hotkeys);
  }
  onCleanup(() => hotkeys.dispose());

  const select = (
    activeIds: string[],
    optionId: string,
    multiple: boolean,
    onChange: (ids: string[]) => void
  ) => {
    if (!multiple) {
      onChange(activeIds.includes(optionId) ? [] : [optionId]);
      return;
    }
    onChange(
      activeIds.includes(optionId)
        ? activeIds.filter((id) => id !== optionId)
        : [...activeIds, optionId]
    );
  };

  return (
    <Show when={controls().length > 0}>
      <Dropdown placement="bottom-start" open={open()} onOpenChange={setOpen}>
        <Dropdown.Trigger
          depth={props.variant === 'add' ? undefined : 2}
          variant={props.variant === 'add' ? 'ghost' : 'base'}
          size={props.variant === 'add' ? 'icon-sm' : 'sm'}
          tooltip={props.variant === 'add' ? 'Add filters' : 'Filter'}
          class={props.variant === 'add' ? 'p-1 rounded-full' : 'bg-surface'}
        >
          <Show
            when={props.variant === 'add'}
            fallback={
              <>
                <FilterIcon />
                <span>Filter</span>
              </>
            }
          >
            <PlusIcon class="size-3" />
          </Show>
        </Dropdown.Trigger>
        <Dropdown.Content class="shadow-menu">
          <For each={controls()}>
            {(control) => (
              <Dropdown.Sub>
                <Dropdown.SubTrigger>
                  <span class="flex-1">{control.label}</span>
                  <CaretRightIcon class="size-3 text-ink-muted" />
                </Dropdown.SubTrigger>
                <Dropdown.SubContent class="shadow-menu">
                  <Show
                    when={control.searchable}
                    fallback={
                      <Dropdown.Group>
                        <For each={control.options()}>
                          {(option) => (
                            <Dropdown.Item
                              closeOnSelect={!control.multiple}
                              onSelect={() =>
                                select(
                                  control.activeIds(),
                                  option.id,
                                  control.multiple,
                                  control.onChange
                                )
                              }
                            >
                              <SelectionIndicator
                                active={control.activeIds().includes(option.id)}
                              />
                              <Show when={option.icon}>
                                {(icon) => icon()()}
                              </Show>
                              <span class="flex-1 truncate">
                                {option.label}
                              </span>
                            </Dropdown.Item>
                          )}
                        </For>
                      </Dropdown.Group>
                    }
                  >
                    <div class="w-64 p-1">
                      <SearchableMultiSelectInline
                        options={control.options}
                        activeIds={control.activeIds}
                        onChange={control.onChange}
                        placeholder={control.placeholder}
                        preserveOrder={control.preserveOrder}
                      />
                    </div>
                  </Show>
                </Dropdown.SubContent>
              </Dropdown.Sub>
            )}
          </For>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );
}
