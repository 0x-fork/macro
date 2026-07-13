import type { FilterID } from '@app/features/next-soup/filters';
import { useSoupView } from '@app/features/next-soup/soup-view/soup-view-context';

export const TASK_STATUS_FILTER_IDS: FilterID[] = [
  'task-not-started',
  'task-in-progress',
  'task-in-review',
  'task-completed',
  'task-canceled',
];

export function useTaskStatusFilter() {
  const { soup } = useSoupView();

  const isActive = (id: FilterID) => soup.facets.has('task-status', id);
  const toggle = (id: FilterID) => soup.facets.toggle('task-status', id);
  const clear = () => soup.facets.clear('task-status');

  return { isActive, toggle, clear };
}
