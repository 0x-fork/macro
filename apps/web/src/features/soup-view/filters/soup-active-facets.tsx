import XIcon from '@phosphor/x.svg';
import { Button, Layer } from '@ui';
import { For, Show } from 'solid-js';
import { useSoupView } from '../context';
import {
  clearFacetControlRefinements,
  facetControlResetValue,
  isFacetControlRefinement,
} from './facet-control-refinements';
import { useSoupFacetControls } from './use-soup-facet-controls';

export function SoupActiveFacets() {
  const baseline = useSoupView().activePresetFacets;
  const controls = useSoupFacetControls();
  const active = () =>
    controls().filter((control) =>
      isFacetControlRefinement(control, baseline())
    );

  const valueLabel = (control: ReturnType<typeof controls>[number]) => {
    const ids = control.activeIds();
    if (ids.length === 0) return 'None';
    const labels = ids.map(
      (id) => control.options().find((option) => option.id === id)?.label ?? id
    );
    if (labels.length <= 2) return labels.join(', ');
    return `${labels[0]} +${labels.length - 1}`;
  };

  const clearAll = () => clearFacetControlRefinements(controls(), baseline());

  return (
    <Show when={active().length > 0}>
      <div class="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-hidden">
        <For each={active()}>
          {(control) => (
            <Layer depth={2}>
              <div class="flex h-7 items-center overflow-hidden rounded-md border border-edge-muted bg-surface text-xs">
                <span class="px-2 text-ink-muted">{control.label}</span>
                <span class="max-w-40 truncate border-l border-edge-muted px-2">
                  {valueLabel(control)}
                </span>
                <Button
                  size="icon-sm"
                  class="h-full rounded-none border-l border-edge-muted hover:text-failure"
                  label={`Clear ${control.label}`}
                  onClick={() =>
                    control.onChange(
                      facetControlResetValue(control, baseline())
                    )
                  }
                >
                  <XIcon class="size-3" />
                </Button>
              </div>
            </Layer>
          )}
        </For>
        <Button variant="ghost" size="sm" onClick={clearAll}>
          Clear all
        </Button>
      </div>
    </Show>
  );
}
