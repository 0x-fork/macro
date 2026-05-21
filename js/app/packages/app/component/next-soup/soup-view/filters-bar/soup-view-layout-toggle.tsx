import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import GridFourIcon from '@phosphor/grid-four.svg';
import ListIcon from '@phosphor/list.svg';
import { Button, cn, Tooltip } from '@ui';
import { Show } from 'solid-js';

export const SoupViewLayoutToggle = () => {
  const { groupByField, layout, setLayout } = useSoupView();

  return (
    <Show when={groupByField()}>
      <div class="flex items-center gap-px rounded-md bg-surface depth-2 border border-edge-muted overflow-hidden">
        <Tooltip label="List view">
          <Button
            variant="base"
            size="sm"
            class={cn(
              'rounded-none border-0 px-1.5',
              layout() === 'list'
                ? 'bg-active text-ink'
                : 'bg-transparent text-text-muted'
            )}
            onClick={() => setLayout('list')}
            aria-pressed={layout() === 'list'}
          >
            <ListIcon class="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip label="Kanban view">
          <Button
            variant="base"
            size="sm"
            class={cn(
              'rounded-none border-0 px-1.5',
              layout() === 'kanban'
                ? 'bg-active text-ink'
                : 'bg-transparent text-text-muted'
            )}
            onClick={() => setLayout('kanban')}
            aria-pressed={layout() === 'kanban'}
          >
            <GridFourIcon class="size-3.5" />
          </Button>
        </Tooltip>
      </div>
    </Show>
  );
};
