import {
  type GroupOptionId,
  soupGroupOptions,
} from '@app/features/soup/view/components/grouping/group-options';
import { SearchableMultiSelectInline } from '@app/features/soup/view/components/searchable-multi-select';
import {
  type SystemSortOption,
  soupSortOptions,
} from '@app/features/soup/view/components/sorting/sort-options';
import { useSoupView } from '@app/features/soup/view/context';
import { MobileDrawer } from '@components/app/mobile/MobileDrawer';
import CheckIcon from '@phosphor/check.svg';
import SlidersIcon from '@phosphor/sliders-horizontal.svg';
import XIcon from '@phosphor/x.svg';
import { Button } from '@ui';
import { For, type JSX, Show } from 'solid-js';

import {
  clearFacetControlRefinements,
  isFacetControlRefinement,
} from '../filters/facet-control-refinements';
import { useSoupFacetControls } from '../filters/use-soup-facet-controls';

const DrawerRow = (props: {
  active: boolean;
  label: string;
  icon?: () => JSX.Element;
  role: 'checkbox' | 'radio';
  onClick: () => void;
}) => (
  <button
    type="button"
    role={props.role}
    aria-checked={props.active}
    class="flex w-full items-center gap-3 bg-surface px-3 py-2.5 text-left text-sm transition-colors not-last:mb-px hover:bg-hover"
    onClick={props.onClick}
  >
    <Show when={props.icon}>
      {(icon) => (
        <span class="flex size-4 shrink-0 items-center justify-center text-ink-muted">
          {icon()()}
        </span>
      )}
    </Show>
    <span class="flex-1 truncate">{props.label}</span>
    <Show when={props.active}>
      <CheckIcon class="size-3.5 shrink-0 text-accent" />
    </Show>
  </button>
);

export function SoupMobileFilterDrawer() {
  const { activePresetFacets, collection, sortVisible, view } = useSoupView();
  const controls = useSoupFacetControls();
  const sortOptions = () => soupSortOptions(view());
  const groupOptions = () => soupGroupOptions(view());
  const activeSort = () =>
    (collection.state.sort[0]?.id as SystemSortOption | undefined) ??
    'updated_at';
  const activeGroup = () =>
    (collection.state.groupBy as GroupOptionId | undefined) ?? 'none';
  const activeControls = () =>
    controls().filter((control) =>
      isFacetControlRefinement(control, activePresetFacets())
    );
  const visible = () =>
    controls().length > 0 || sortVisible() || groupOptions().length > 0;

  const toggleOption = (
    control: ReturnType<typeof controls>[number],
    optionId: string
  ) => {
    const active = control.activeIds();
    if (!control.multiple) {
      control.onChange(active.includes(optionId) ? [] : [optionId]);
      return;
    }
    control.onChange(
      active.includes(optionId)
        ? active.filter((id) => id !== optionId)
        : [...active, optionId]
    );
  };

  return (
    <Show when={visible()}>
      <MobileDrawer
        side="bottom"
        preventScroll={false}
        preventScrollbarShift={false}
        breakPoints={[0.85]}
      >
        <MobileDrawer.Trigger
          as={Button}
          variant="ghost"
          size="icon-sm"
          aria-label="Open filters and sorting"
          class="relative"
        >
          <SlidersIcon />
          <Show when={activeControls().length > 0}>
            <span class="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-xxs font-medium leading-none text-surface">
              {activeControls().length}
            </span>
          </Show>
        </MobileDrawer.Trigger>

        <MobileDrawer.Portal>
          <MobileDrawer.Overlay class="fixed inset-0 z-modal-overlay bg-modal-overlay pattern-diagonal-4 pattern-edge-muted" />
          <MobileDrawer.Content
            aria-label="Filters and sorting"
            targetHeight={80}
          >
            <MobileDrawer.Handle />
            <div class="flex min-h-0 flex-1 flex-col">
              <div class="flex items-center justify-between px-4 pb-3">
                <h2 class="text-base font-semibold">Filter and sort</h2>
                <Show when={activeControls().length > 0}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      clearFacetControlRefinements(
                        controls(),
                        activePresetFacets()
                      )
                    }
                  >
                    <XIcon class="size-3.5" />
                    Clear filters
                  </Button>
                </Show>
              </div>

              <div class="flex-1 overflow-y-auto pb-4 scrollbar-hidden">
                <Show when={sortVisible()}>
                  <MobileDrawer.Label id="soup-mobile-sort-label">
                    Sort
                  </MobileDrawer.Label>
                  <MobileDrawer.Section
                    role="radiogroup"
                    aria-labelledby="soup-mobile-sort-label"
                    class="mb-4"
                  >
                    <For each={sortOptions()}>
                      {(option) => (
                        <DrawerRow
                          role="radio"
                          active={activeSort() === option.value}
                          label={option.label}
                          icon={option.icon}
                          onClick={() =>
                            collection.setState('sort', [
                              { id: option.value, reversed: false },
                            ])
                          }
                        />
                      )}
                    </For>
                  </MobileDrawer.Section>
                </Show>

                <Show when={groupOptions().length > 0}>
                  <MobileDrawer.Label id="soup-mobile-group-label">
                    Group
                  </MobileDrawer.Label>
                  <MobileDrawer.Section
                    role="radiogroup"
                    aria-labelledby="soup-mobile-group-label"
                    class="mb-4"
                  >
                    <For each={groupOptions()}>
                      {(option) => (
                        <DrawerRow
                          role="radio"
                          active={activeGroup() === option.value}
                          label={option.label}
                          onClick={() => {
                            collection.setState(
                              'groupBy',
                              option.value === 'none' ? undefined : option.value
                            );
                            collection.collapsedGroups.expandAll();
                          }}
                        />
                      )}
                    </For>
                  </MobileDrawer.Section>
                </Show>

                <For each={controls()}>
                  {(control) => (
                    <div class="mb-4">
                      <MobileDrawer.Label>{control.label}</MobileDrawer.Label>
                      <MobileDrawer.Section>
                        <Show
                          when={control.searchable}
                          fallback={
                            <For each={control.options()}>
                              {(option) => (
                                <DrawerRow
                                  role={control.multiple ? 'checkbox' : 'radio'}
                                  active={control
                                    .activeIds()
                                    .includes(option.id)}
                                  label={option.label}
                                  icon={option.icon}
                                  onClick={() =>
                                    toggleOption(control, option.id)
                                  }
                                />
                              )}
                            </For>
                          }
                        >
                          <div class="bg-surface p-2">
                            <SearchableMultiSelectInline
                              options={control.options}
                              activeIds={control.activeIds}
                              onChange={control.onChange}
                              placeholder={control.placeholder}
                              preserveOrder={control.preserveOrder}
                            />
                          </div>
                        </Show>
                      </MobileDrawer.Section>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer>
    </Show>
  );
}
