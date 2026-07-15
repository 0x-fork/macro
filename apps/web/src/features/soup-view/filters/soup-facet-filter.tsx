import type { ListView } from '@app/constants/list-views';
import { useSoupCollection } from '@app/features/soup-list';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import FilterIcon from '@phosphor/funnel-simple.svg';
import { cn, Dropdown, Tooltip } from '@ui';
import { For, Show } from 'solid-js';
import { VIEW_FACETS } from './facet-views';

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

export function SoupFacetFilter(props: { view: ListView }) {
  const collection = useSoupCollection();
  const categories = () => VIEW_FACETS[props.view] ?? [];

  const select = (facetId: string, optionId: string, multiple?: boolean) => {
    if (multiple) {
      collection.facets.toggle(facetId, optionId);
      return;
    }
    collection.facets.set(
      facetId,
      collection.facets.has(facetId, optionId) ? [] : [optionId]
    );
  };

  return (
    <Show when={categories().length > 0}>
      <Dropdown placement="bottom-start">
        <Tooltip label="Filter">
          <Dropdown.Trigger depth={2} class="bg-surface">
            <FilterIcon />
            <span>Filter</span>
          </Dropdown.Trigger>
        </Tooltip>
        <Dropdown.Content class="shadow-menu">
          <For each={categories()}>
            {(category) => (
              <Dropdown.Sub>
                <Dropdown.SubTrigger>
                  <span class="flex-1">{category.label}</span>
                  <CaretRightIcon class="size-3 text-ink-muted" />
                </Dropdown.SubTrigger>
                <Dropdown.SubContent class="shadow-menu">
                  <Dropdown.Group>
                    <For each={category.options}>
                      {(option) => (
                        <Dropdown.Item
                          closeOnSelect={!category.multiple}
                          onSelect={() =>
                            select(category.id, option.id, category.multiple)
                          }
                        >
                          <SelectionIndicator
                            active={collection.facets.has(
                              category.id,
                              option.id
                            )}
                          />
                          <Show when={option.icon}>{(icon) => icon()()}</Show>
                          <span class="flex-1 truncate">{option.label}</span>
                        </Dropdown.Item>
                      )}
                    </For>
                  </Dropdown.Group>
                </Dropdown.SubContent>
              </Dropdown.Sub>
            )}
          </For>
        </Dropdown.Content>
      </Dropdown>
    </Show>
  );
}
