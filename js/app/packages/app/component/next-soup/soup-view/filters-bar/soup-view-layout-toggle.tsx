import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import GridFourIcon from '@phosphor/grid-four.svg';
import ListIcon from '@phosphor/list.svg';
import { cn, Tooltip } from '@ui';
import { Show } from 'solid-js';

export const SoupViewLayoutToggle = () => {
  const { groupByField, layout, setLayout } = useSoupView();

  const buttonClass = (active: boolean) =>
    cn(
      'flex items-center justify-center size-6 rounded',
      'transition-colors',
      active
        ? 'bg-ink-muted/10 text-ink'
        : 'text-ink-muted/70 hover:text-ink hover:bg-ink-muted/6'
    );

  return (
    <Show when={groupByField()}>
      <div class="flex items-center gap-0.5 p-0.5 rounded-md bg-ink-muted/[0.035]">
        <Tooltip label="List view">
          <button
            type="button"
            class={buttonClass(layout() === 'list')}
            onClick={() => setLayout('list')}
            aria-pressed={layout() === 'list'}
          >
            <ListIcon class="size-3.5" />
          </button>
        </Tooltip>
        <Tooltip label="Kanban view">
          <button
            type="button"
            class={buttonClass(layout() === 'kanban')}
            onClick={() => setLayout('kanban')}
            aria-pressed={layout() === 'kanban'}
          >
            <GridFourIcon class="size-3.5" />
          </button>
        </Tooltip>
      </div>
    </Show>
  );
};
