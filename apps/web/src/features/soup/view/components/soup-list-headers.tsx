import type { SystemSortOption } from '@app/features/soup/view/components/sorting/sort-options';
import { useSoupView } from '@app/features/soup/view/context';
import {
  COMPANY_GRID_COLUMNS,
  companyGridTemplateAreas,
  companyGridTemplateColumns,
} from '@app/features/soup/view/views/companies/company-grid-template';
import {
  TASK_GRID_COLUMNS,
  TASK_GRID_TEMPLATE_AREAS_WIDE,
  TASK_GRID_TEMPLATE_COLUMNS_WIDE,
} from '@app/features/soup/view/views/tasks/task-grid-template';
import { useCrmDisplayOptions } from '@companies/crm/display-options';
import { useListLayout } from '@entity/composed/list-entity/shared';
import StatusInProgress from '@icon/square-task-in-progress-circle.svg';
import PriorityHigh from '@icon/wide-priority-high.svg';
import ArrowDownIcon from '@phosphor/arrow-down.svg';
import UsersIcon from '@phosphor/users.svg';
import { cn, Tooltip } from '@ui';
import { For, type JSX, Show } from 'solid-js';

const HEADER_ICON_CLASS = 'size-3 @max-[840px]/u-list:size-4 text-ink-muted';
const TASK_ICONS: Record<string, () => JSX.Element> = {
  status: () => <StatusInProgress class={HEADER_ICON_CLASS} />,
  priority: () => <PriorityHigh class={HEADER_ICON_CLASS} />,
  assignees: () => <UsersIcon class={HEADER_ICON_CLASS} />,
};
const TASK_SORTS: Partial<Record<string, SystemSortOption>> = {
  status: 'status',
  priority: 'priority',
};

function useHeaderSort() {
  const { collection } = useSoupView();
  const active = () => collection.state.sort[0];
  const toggle = (id: SystemSortOption) => {
    const current = active();
    collection.setState('sort', [
      {
        id,
        reversed: current?.id === id ? !current.reversed : false,
      },
    ]);
  };
  return { active, toggle };
}

function SortArrow(props: { active: boolean; reversed: boolean }) {
  return (
    <ArrowDownIcon
      class={cn(
        'size-3 shrink-0 transition-transform',
        props.active ? 'text-ink' : 'text-ink-extra-muted',
        props.active && props.reversed && 'rotate-180'
      )}
    />
  );
}

function TaskHeaderCell(props: {
  area: string;
  label: string;
  sort?: SystemSortOption;
  icon?: () => JSX.Element;
  align?: 'start' | 'end';
  class?: string;
}) {
  const sort = useHeaderSort();
  const active = () => sort.active()?.id === props.sort;
  return (
    <div
      style={{ 'grid-area': props.area }}
      class={cn('flex min-w-0 items-center', props.class)}
    >
      <Show
        when={props.sort}
        fallback={
          <div
            class={cn(
              'flex w-full min-w-0 items-center',
              props.align === 'end' ? 'justify-end' : 'justify-start',
              props.icon && '@max-[840px]/u-list:justify-center'
            )}
          >
            <Show when={props.icon} fallback={<span>{props.label}</span>}>
              <span class="truncate @max-[840px]/u-list:hidden">
                {props.label}
              </span>
              <span class="hidden @max-[840px]/u-list:flex">
                {props.icon?.()}
              </span>
            </Show>
          </div>
        }
      >
        {(id) => (
          <button
            type="button"
            class={cn(
              'flex h-full w-full min-w-0 items-center gap-1 hover:text-ink',
              props.align === 'end' ? 'justify-end' : 'justify-start',
              props.icon && '@max-[840px]/u-list:justify-center',
              active() && 'text-ink'
            )}
            onClick={() => sort.toggle(id())}
          >
            <Show when={props.icon}>
              <Tooltip label={props.label}>{props.icon?.()}</Tooltip>
            </Show>
            <span class="truncate @max-[840px]/u-list:hidden">
              {props.label}
            </span>
            <SortArrow
              active={active()}
              reversed={sort.active()?.reversed ?? false}
            />
          </button>
        )}
      </Show>
    </div>
  );
}

function TaskListHeader() {
  return (
    <div
      class="task-grid-row grid h-10 w-full shrink-0 items-center gap-2 bg-surface px-3 text-xs font-medium text-ink-extra-muted"
      style={{
        'grid-template-columns': TASK_GRID_TEMPLATE_COLUMNS_WIDE,
        'grid-template-areas': TASK_GRID_TEMPLATE_AREAS_WIDE,
      }}
    >
      <div style={{ 'grid-area': 'indicator' }} />
      <div style={{ 'grid-area': 'content' }} class="truncate">
        Task
      </div>
      <For each={TASK_GRID_COLUMNS}>
        {(column) => (
          <TaskHeaderCell
            area={column.id}
            label={column.label}
            sort={TASK_SORTS[column.id]}
            icon={TASK_ICONS[column.id]}
            class="@min-[841px]/u-list:pl-2"
          />
        )}
      </For>
      <TaskHeaderCell
        area="createdBy"
        label="Created By"
        class="hidden truncate @min-[1221px]/u-list:flex"
      />
      <TaskHeaderCell
        area="timestamp"
        label="Updated"
        sort="updated_at"
        align="end"
      />
    </div>
  );
}

function CompanyListHeader() {
  const display = useCrmDisplayOptions();
  const sort = useHeaderSort();
  const visibleColumns = () =>
    COMPANY_GRID_COLUMNS.filter(
      (column) => display.options().listColumns[column.id]
    );
  const active = () => sort.active()?.id === 'updated_at';

  return (
    <div
      class="company-grid-row grid h-10 w-full shrink-0 items-center gap-2 bg-surface px-3 text-xs font-medium text-ink-extra-muted"
      style={{
        'grid-template-columns': companyGridTemplateColumns(
          visibleColumns(),
          false
        ),
        'grid-template-areas': companyGridTemplateAreas(
          visibleColumns(),
          false
        ),
      }}
    >
      <div style={{ 'grid-area': 'indicator' }} />
      <div style={{ 'grid-area': 'content' }} class="truncate">
        Customer
      </div>
      <For each={visibleColumns()}>
        {(column) => (
          <div
            style={{ 'grid-area': column.id }}
            class="flex min-w-0 items-center @min-[841px]/u-list:pl-2"
          >
            <span class="truncate @max-[840px]/u-list:hidden">
              {column.label}
            </span>
          </div>
        )}
      </For>
      <div style={{ 'grid-area': 'timestamp' }}>
        <button
          type="button"
          class={cn(
            'flex h-full w-full items-center justify-end gap-1 hover:text-ink',
            active() && 'text-ink'
          )}
          onClick={() => sort.toggle('updated_at')}
        >
          <span class="truncate">Last Interaction</span>
          <SortArrow
            active={active()}
            reversed={sort.active()?.reversed ?? false}
          />
        </button>
      </div>
    </div>
  );
}

export function SoupListHeader() {
  const layout = useListLayout();
  const { view, viewMode } = useSoupView();
  const wide = () => layout?.isWide() ?? true;
  return (
    <Show when={wide()}>
      <Show when={view() === 'tasks'}>
        <TaskListHeader />
      </Show>
      <Show when={view() === 'companies' && viewMode() === 'list'}>
        <CompanyListHeader />
      </Show>
    </Show>
  );
}
