import type { CallStatus } from '@app/component/next-soup/filters/filter-store/types';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { createMemo } from 'solid-js';

export type SearchIndexId =
  | 'channels'
  | 'document-or-file'
  | 'task'
  | 'email'
  | 'calls'
  | 'folders'
  | 'agent';

export type SearchTypeValue = SearchIndexId | 'all';

export type SearchFiltersSections = {
  // inboxIds: `undefined` = all inboxes (default), `[]` = explicitly none,
  // a subset = those inboxes — same model as the mail view's inbox filter.
  email: { importance: boolean | undefined; inboxIds: string[] | undefined };
  channels: { in: string[]; from: string[] };
  calls: { in: string[]; from: string[]; status: CallStatus | undefined };
  task: {
    status: string[];
    priority: string[];
    assignees: string[];
    createdBy: string[];
  };
};

export type SearchFiltersState = SearchFiltersSections & {
  type: SearchTypeValue;
};

export const DEFAULT_SECTIONS: SearchFiltersSections = {
  email: { importance: undefined, inboxIds: undefined },
  channels: { in: [], from: [] },
  calls: { in: [], from: [], status: undefined },
  task: { status: [], priority: [], assignees: [], createdBy: [] },
};

/**
 * Facet state is read from and written to `soup.facets` (the single source of
 * truth). Every getter projects the relevant facet selection; every setter
 * writes it back. External writers (Cmd+K search overrides, per-entry restore)
 * go through the same facet store, so they stay in sync automatically.
 */
export function createSearchFiltersController() {
  const { soup } = useSoupView();

  const type = () =>
    (soup.facets.getSelected('search-type')[0] as SearchTypeValue) ?? 'all';
  const setType = (next: SearchTypeValue) =>
    soup.facets.set('search-type', next === 'all' ? [] : [next]);

  const emailImportance = () =>
    soup.facets.has('email-importance', 'important') ? true : undefined;
  const setEmailImportance = (importance: boolean | undefined) =>
    soup.facets.set('email-importance', importance ? ['important'] : []);

  const emailInbox = createMemo(() => soup.facets.getSelected('email-inbox'));
  const setEmailInbox = (ids: string[] | undefined) =>
    soup.facets.set('email-inbox', ids ?? []);

  const channelIn = createMemo(() => soup.facets.getSelected('channel-in'));
  const setChannelIn = (ids: string[]) => soup.facets.set('channel-in', ids);
  const channelFrom = createMemo(() => soup.facets.getSelected('channel-from'));
  const setChannelFrom = (ids: string[]) =>
    soup.facets.set('channel-from', ids);

  const callIn = createMemo(() => soup.facets.getSelected('call-in'));
  const setCallIn = (ids: string[]) => soup.facets.set('call-in', ids);
  const callFrom = createMemo(() => soup.facets.getSelected('call-from'));
  const setCallFrom = (ids: string[]) => soup.facets.set('call-from', ids);
  const callStatus = () =>
    soup.facets.getSelected('call-status')[0] as CallStatus | undefined;
  const setCallStatus = (status: CallStatus | undefined) =>
    soup.facets.set('call-status', status ? [status] : []);

  const taskStatus = createMemo(() => soup.facets.getSelected('task-status'));
  const setTaskStatus = (ids: string[]) => soup.facets.set('task-status', ids);
  const taskPriority = createMemo(() =>
    soup.facets.getSelected('task-priority')
  );
  const setTaskPriority = (ids: string[]) =>
    soup.facets.set('task-priority', ids);
  const taskAssignees = createMemo(() => soup.facets.getSelected('assignee'));
  const setTaskAssignees = (ids: string[]) => soup.facets.set('assignee', ids);
  const taskCreatedBy = createMemo(() =>
    soup.facets.getSelected('task-created-by')
  );
  const setTaskCreatedBy = (ids: string[]) =>
    soup.facets.set('task-created-by', ids);

  return {
    type,
    setType,
    emailImportance,
    setEmailImportance,
    emailInbox,
    setEmailInbox,
    channelIn,
    setChannelIn,
    channelFrom,
    setChannelFrom,
    callIn,
    setCallIn,
    callFrom,
    setCallFrom,
    callStatus,
    setCallStatus,
    taskStatus,
    setTaskStatus,
    taskPriority,
    setTaskPriority,
    taskAssignees,
    setTaskAssignees,
    taskCreatedBy,
    setTaskCreatedBy,
  };
}

export type SearchFiltersController = ReturnType<
  typeof createSearchFiltersController
>;
