import { QUERY_FILTERS } from '@app/component/next-soup/filters/filters';
import type { SoupState } from '@app/component/next-soup/create-soup-state';
import type { SoupItemsQueryFilters } from '@queries/soup/items';
import { batch, type Setter } from 'solid-js';

export type SidebarPresetViewId =
  | 'sidebar-message-inbox'
  | 'sidebar-my-tasks'
  | 'sidebar-team-tasks';

export function applySidebarPreset(params: {
  viewId: SidebarPresetViewId | undefined;
  soup: SoupState;
  setQueryFilters: Setter<SoupItemsQueryFilters>;
  setStatusFilter: Setter<string | undefined>;
  setAssigneeFilter: Setter<string | undefined>;
  userId: string;
}) {
  const { viewId, soup, setQueryFilters, setStatusFilter, setAssigneeFilter, userId } =
    params;

  if (!viewId) return;

  batch(() => {
    soup.filters.clear();
    setQueryFilters(QUERY_FILTERS.default);
    setStatusFilter(undefined);
    setAssigneeFilter(undefined);
    soup.setPreviewEntity(undefined);

    switch (viewId) {
      case 'sidebar-message-inbox':
        soup.filters.activate('signal');
        soup.filters.activate('not-done');
        break;
      case 'sidebar-my-tasks':
        soup.filters.activate('task');
        setQueryFilters(QUERY_FILTERS.task);
        setAssigneeFilter(userId);
        break;
      case 'sidebar-team-tasks':
        soup.filters.activate('task');
        setQueryFilters(QUERY_FILTERS.task);
        break;
    }
  });
}
