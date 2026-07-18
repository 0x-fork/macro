import type { EntityData } from '@entity';
import XIcon from '@phosphor/x.svg';
import { Button, Layer } from '@ui';
import { For } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { useSoupEntityActions } from '../actions/use-soup-entity-actions';

export function SoupSelectionToolbar(props: {
  selected: readonly EntityData[];
  onClear: () => void;
}) {
  const entityActions = useSoupEntityActions();
  const actions = () => entityActions.build(props.selected);
  const visibleActions = () =>
    ['mark-done', 'favorite', 'delete', 'properties', 'copy-id']
      .flatMap((id) => {
        const action = actions().find((candidate) => candidate.id === id);
        return action ? [action] : [];
      })
      .slice(0, 3);
  return (
    <div class="pointer-events-none absolute inset-x-0 bottom-4 z-floating flex justify-center px-3">
      <Layer depth={3}>
        <div class="pointer-events-auto flex h-10 items-center gap-1 rounded-xl border border-edge-muted bg-surface px-2 shadow-menu">
          <span class="px-1 text-sm font-medium tabular-nums">
            {props.selected.length} selected
          </span>
          <For each={visibleActions()}>
            {(action) => (
              <Button
                variant="ghost"
                size="sm"
                class={action.destructive ? 'text-failure-ink' : undefined}
                onClick={() => void action.run()}
              >
                <Dynamic component={action.icon} class="size-3.5" />
                {action.label}
              </Button>
            )}
          </For>
          <Button
            variant="ghost"
            size="icon-sm"
            label="Close selection"
            onClick={props.onClear}
          >
            <XIcon class="size-3.5" />
          </Button>
        </div>
      </Layer>
    </div>
  );
}
