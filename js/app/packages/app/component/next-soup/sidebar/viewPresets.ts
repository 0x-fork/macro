import { QUERY_FILTERS } from '@app/component/next-soup/filters/filters';
import type { SoupState } from '@app/component/next-soup/create-soup-state';
import type { SoupItemsQueryFilters } from '@queries/soup/items';
import { batch, type Setter } from 'solid-js';

export type SidebarPresetViewId =
  | 'sidebar-home'
  | 'sidebar-inbox'
  | 'sidebar-sent'
  | 'sidebar-messages'
  | 'sidebar-my-notes'
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
      case 'sidebar-home':
        break;
      case 'sidebar-inbox':
      case 'sidebar-message-inbox':
        soup.filters.activate('signal');
        soup.filters.activate('not-done');
        break;
      case 'sidebar-sent':
        soup.filters.activate('email');
        setQueryFilters(QUERY_FILTERS.email);
        break;
      case 'sidebar-messages':
        soup.filters.activate('channels');
        setQueryFilters(QUERY_FILTERS.channels);
        break;
      case 'sidebar-my-notes':
        soup.filters.activate('document');
        setQueryFilters(QUERY_FILTERS.document);
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
