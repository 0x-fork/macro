import {
  type ConsolidatedFilter,
  ConsolidatedFilterChip,
} from '@app/features/next-soup/soup-view/filters-bar/consolidated-filter-chip';
import type { FacetSelection } from '@app/features/soup-list';
import XIcon from '@phosphor/x.svg';
import { Button, Layer } from '@ui';
import { For, Show } from 'solid-js';
import { useSoupView } from '../context';
import {
  clearFacetControlRefinements,
  facetControlResetValue,
  isFacetControlRefinement,
} from './facet-control-refinements';
import {
  type SoupFacetControl,
  useSoupFacetControls,
} from './use-soup-facet-controls';

function SoupActiveFacetChip(props: {
  control: SoupFacetControl;
  baseline: FacetSelection;
}) {
  const values = () =>
    props.control.activeIds().map((id) => {
      const option = props.control
        .options()
        .find((candidate) => candidate.id === id);
      return option ?? { id, label: id };
    });
  const toggleValue = (id: string) => {
    const active = props.control.activeIds();
    if (!props.control.multiple) {
      props.control.onChange(active.includes(id) ? [] : [id]);
      return;
    }
    props.control.onChange(
      active.includes(id)
        ? active.filter((activeId) => activeId !== id)
        : [...active, id]
    );
  };
  const filter: ConsolidatedFilter = {
    key: props.control.id,
    categoryLabel: props.control.label,
    categoryLabelPlural: props.control.labelPlural,
    values,
    get availableOptions() {
      return props.control.searchable ? undefined : props.control.options();
    },
    multiple: props.control.multiple,
    onRemoveAll: () =>
      props.control.onChange(
        facetControlResetValue(props.control, props.baseline)
      ),
    onToggleValue: toggleValue,
    isValueActive: (id) => props.control.activeIds().includes(id),
    searchableOptions: props.control.searchable
      ? props.control.options
      : undefined,
    activeSearchableIds: props.control.searchable
      ? props.control.activeIds
      : undefined,
    onSearchableChange: props.control.searchable
      ? props.control.onChange
      : undefined,
    searchPlaceholder: props.control.placeholder,
    preserveOptionOrder: props.control.preserveOrder,
  };

  return <ConsolidatedFilterChip filter={filter} />;
}

export function SoupActiveFacets() {
  const baseline = useSoupView().activePresetFacets;
  const controls = useSoupFacetControls();
  const active = () =>
    controls().filter((control) =>
      isFacetControlRefinement(control, baseline())
    );
  const clearAll = () => clearFacetControlRefinements(controls(), baseline());

  return (
    <Show when={active().length > 0}>
      <Layer depth={0}>
        <div class="w-full p-2">
          <div class="flex min-w-0 items-center gap-2 overflow-x-auto rounded-lg border border-edge-muted bg-surface p-2 scrollbar-hidden">
            <For each={active()}>
              {(control) => (
                <SoupActiveFacetChip control={control} baseline={baseline()} />
              )}
            </For>
            <Button
              variant="ghost"
              size="sm"
              class="shrink-0"
              onClick={clearAll}
            >
              <XIcon class="size-3.5" />
              Clear all
            </Button>
          </div>
        </div>
      </Layer>
    </Show>
  );
}
