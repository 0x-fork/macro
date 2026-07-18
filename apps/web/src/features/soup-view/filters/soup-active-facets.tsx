import XIcon from '@phosphor/x.svg';
import { Button, Layer } from '@ui';
import { For, Show } from 'solid-js';
import { useSoupView } from '../context';
import { useSoupFacetControls } from './use-soup-facet-controls';

const sameIds = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
};

export function SoupActiveFacets() {
  const baseline = useSoupView().activePresetFacets;
  const controls = useSoupFacetControls();
  const resetValue = (control: ReturnType<typeof controls>[number]) =>
    control.id === 'task_status' ? [] : (baseline()[control.id] ?? []);
  const active = () =>
    controls().filter((control) => {
      const selected = control.activeIds();
      if (control.id === 'task_status') {
        return (
          selected.length > 0 && selected.length < control.options().length
        );
      }
      return !sameIds(selected, baseline()[control.id] ?? []);
    });

  const valueLabel = (control: ReturnType<typeof controls>[number]) => {
    const ids = control.activeIds();
    if (ids.length === 0) return 'None';
    const labels = ids.map(
      (id) => control.options().find((option) => option.id === id)?.label ?? id
    );
    if (labels.length <= 2) return labels.join(', ');
    return `${labels[0]} +${labels.length - 1}`;
  };

  const clearAll = () => {
    const values = baseline();
    for (const control of controls()) {
      control.onChange(
        control.id === 'task_status' ? [] : (values[control.id] ?? [])
      );
    }
  };

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
                  onClick={() => control.onChange(resetValue(control))}
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
