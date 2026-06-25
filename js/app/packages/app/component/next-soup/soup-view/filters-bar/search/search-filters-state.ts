import {
  defineQueryFilters,
  NIL_UUID,
  type Query,
} from '@app/component/next-soup/filters/filter-store';
import type {
  CallStatus,
  FieldFilters,
  PropertyFilter,
} from '@app/component/next-soup/filters/filter-store/types';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { ENABLE_SNIPPETS } from '@core/constant/featureFlags';
import { SYSTEM_PROPERTY_IDS } from '@property/constants';
import { createMemo } from 'solid-js';

const searchBaseline = (): Query => ({
  include: {
    foreignEntityRecordId: [NIL_UUID],
    crmCompanyId: [NIL_UUID],
    channelThreadId: [NIL_UUID],
  },
  exclude: ENABLE_SNIPPETS() ? {} : { subType: ['snippet'] },
});

export type SearchIndexId =
  | 'channels'
  | 'document-or-file'
  | 'task'
  | 'email'
  | 'calls'
  | 'folders'
  | 'agent';

export type SearchTypeValue = SearchIndexId | 'all';

/**
 * Server-side narrowing for each index type. `defineQueryFilters` NIL-fills
 * the id field of every target the input doesn't reference, so each seed
 * matches only its own entity type. Sub-facet values (importance, channel
 * ids, ...) are layered on top by `compileSearchQuery`.
 */
export const SEARCH_INDEX_SEEDS: Record<SearchIndexId, Query> = {
  channels: defineQueryFilters({ exclude: { channelId: [NIL_UUID] } }),
  'document-or-file': defineQueryFilters({ exclude: { subType: ['task'] } }),
  task: defineQueryFilters({ include: { subType: ['task'] } }),
  email: defineQueryFilters({}, { skipTargets: ['ef'] }),
  calls: defineQueryFilters({}, { skipTargets: ['callf'] }),
  folders: defineQueryFilters({ exclude: { folderId: [NIL_UUID] } }),
  agent: defineQueryFilters({ exclude: { chatId: [NIL_UUID] } }),
};

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
 * Single compile path: facet state → query filters. Both data paths (soup
 * AST feed and search-service request) derive from the resulting store
 * state, so this is the only place facet semantics turn into filters.
 *
 * `'all'` compiles to just the search preset baseline — no index narrowing
 * and no email-importance bias. Only the active type's section is compiled;
 * inactive sections never constrain results.
 */
export function compileSearchQuery(state: SearchFiltersState): Query {
  const baseline = searchBaseline();
  const include: FieldFilters = { ...baseline.include };
  const exclude: FieldFilters = { ...baseline.exclude };

  if (state.type === 'all') return { include, exclude };

  const seed = SEARCH_INDEX_SEEDS[state.type];
  Object.assign(include, seed.include);
  Object.assign(exclude, seed.exclude);

  if (state.type === 'email') {
    if (state.email.importance !== undefined) {
      include.emailImportance = state.email.importance;
    }
    if (state.email.inboxIds !== undefined) {
      include.emailLinkId = state.email.inboxIds.length
        ? state.email.inboxIds
        : [NIL_UUID];
    }
  } else if (state.type === 'channels') {
    if (state.channels.in.length) include.channelId = state.channels.in;
    if (state.channels.from.length) {
      include.channelSenderId = state.channels.from;
    }
  } else if (state.type === 'calls') {
    if (state.calls.in.length) include.callChannelId = state.calls.in;
    if (state.calls.from.length) include.callSpeakerId = state.calls.from;
    if (state.calls.status !== undefined) {
      include.callStatus = state.calls.status;
    }
  } else if (state.type === 'task') {
    const properties: PropertyFilter[] = [
      ...state.task.status.map((value) => ({
        propertyId: SYSTEM_PROPERTY_IDS.STATUS,
        type: 'select' as const,
        value,
      })),
      ...state.task.priority.map((value) => ({
        propertyId: SYSTEM_PROPERTY_IDS.PRIORITY,
        type: 'select' as const,
        value,
      })),
      ...state.task.assignees.map((value) => ({
        propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
        type: 'entity' as const,
        value,
      })),
    ];
    if (properties.length) include.properties = properties;
    if (state.task.createdBy.length) {
      include.documentOwnerId = state.task.createdBy;
    }
  }

  return { include, exclude };
}

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
