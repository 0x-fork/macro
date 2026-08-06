import type { ListView } from '@app/constants/list-views';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { z } from 'zod';
import type { FacetSelection } from './facet-store';

const stringArray = z.array(z.string());
const propertyFilterSchema = z.object({
  propertyId: z.string(),
  type: z.enum(['select', 'entity']),
  value: z.string(),
});
const legacyIncludeSchema = z
  .object({
    emailImportance: z.boolean().optional(),
    emailLinkId: stringArray.optional(),
    channelId: stringArray.optional(),
    channelSenderId: stringArray.optional(),
    callChannelId: stringArray.optional(),
    callSpeakerId: stringArray.optional(),
    callStatus: z.enum(['ATTENDED', 'MISSED', 'UNATTENDED']).optional(),
    callAttended: z.boolean().optional(),
    documentOwnerId: stringArray.optional(),
    properties: z.array(propertyFilterSchema).optional(),
    tagFilters: z.array(propertyFilterSchema).optional(),
    tagFilterMode: z.enum(['any', 'all']).optional(),
  })
  .passthrough();
const legacyFiltersSchema = z
  .object({
    include: legacyIncludeSchema.optional(),
  })
  .passthrough();
const legacyPredicatesSchema = z
  .object({
    and: stringArray.optional(),
    or: stringArray.optional(),
  })
  .passthrough();

const SEARCH_TYPES = new Set([
  'channels',
  'document-or-file',
  'task',
  'email',
  'calls',
  'folders',
  'agent',
]);
const SCOPE_IDS = new Set([
  'email',
  'agent',
  'active-agent',
  'automation',
  'people',
  'teams',
  'task',
  'channels',
  'folders',
  'calls',
  'document-or-file',
  'crm-company-active',
  'crm-company-hidden',
  'search-supported',
]);
const ENTITY_TYPE_IDS = new Set([
  'document',
  'agent',
  'people',
  'teams',
  'task',
  'email',
  'file',
  'github-pr',
]);
const GROUPED_PREDICATE_FACETS: Record<string, ReadonlySet<string>> = {
  focus: new Set(['inbox', 'noise', 'explicit-noise']),
  ownership: new Set(['owned-entity', 'shared-entity', 'assigned-to']),
  drafts: new Set(['no-drafts', 'email-drafts']),
  status: new Set(['unread', 'read', 'not-done', 'done']),
  attachment: new Set([
    'attachment-pdf',
    'attachment-image',
    'attachment-document',
  ]),
  calendar: new Set(['has-calendar-invite']),
  type: new Set([
    'doc-markdown',
    'doc-snippet',
    'doc-canvas',
    'file-code',
    'file-image',
    'file-pdf',
    'file-docx',
    'file-video',
    'file-other',
  ]),
  task_status: new Set([
    'task-not-started',
    'task-in-progress',
    'task-in-review',
    'task-completed',
    'task-canceled',
  ]),
  task_priority: new Set([
    'task-urgent',
    'task-high-priority',
    'task-medium-priority',
    'task-low-priority',
    'task-no-priority',
  ]),
};

const TASK_STATUS_IDS = new Map<string, string>([
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED, 'task-not-started'],
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS, 'task-in-progress'],
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW, 'task-in-review'],
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED, 'task-completed'],
  [PROPERTY_OPTION_IDS.STATUS.CANCELED, 'task-canceled'],
]);
const TASK_PRIORITY_IDS = new Map<string, string>([
  [PROPERTY_OPTION_IDS.PRIORITY.URGENT, 'task-urgent'],
  [PROPERTY_OPTION_IDS.PRIORITY.HIGH, 'task-high-priority'],
  [PROPERTY_OPTION_IDS.PRIORITY.MEDIUM, 'task-medium-priority'],
  [PROPERTY_OPTION_IDS.PRIORITY.LOW, 'task-low-priority'],
]);

const setIfNotEmpty = (
  selection: FacetSelection,
  id: string,
  values: readonly string[] | undefined
) => {
  if (values?.length) selection[id] = [...values];
};

const mergeIfNotEmpty = (
  selection: FacetSelection,
  id: string,
  values: readonly string[]
) => {
  if (values.length === 0) return;
  selection[id] = [...new Set([...(selection[id] ?? []), ...values])];
};

/**
 * Convert the bounded legacy Search-controller state into replacement facets.
 * Unknown or malformed fields are ignored so restoration never widens a query.
 */
export function legacySearchStateToFacets(
  filters: unknown,
  predicates: unknown,
  view?: ListView
): FacetSelection {
  const selection: FacetSelection = {};
  const parsedPredicates = legacyPredicatesSchema.safeParse(predicates);
  if (parsedPredicates.success) {
    const andIds = parsedPredicates.data.and ?? [];
    const orIds = parsedPredicates.data.or ?? [];
    if (view === 'search' || view === undefined) {
      const searchType = orIds.find((id) => SEARCH_TYPES.has(id));
      if (searchType) selection.search_type = [searchType];
    } else {
      setIfNotEmpty(
        selection,
        'entity_type',
        orIds.filter((id) => ENTITY_TYPE_IDS.has(id))
      );
    }

    const scope = andIds.find((id) => SCOPE_IDS.has(id));
    if (scope) selection.scope = [scope === 'active-agent' ? 'agent' : scope];

    const predicateIds = [...andIds, ...orIds];
    for (const [facetId, optionIds] of Object.entries(
      GROUPED_PREDICATE_FACETS
    )) {
      const selected = predicateIds.filter((id) => optionIds.has(id));
      if (facetId === 'status' && view === 'inbox') {
        setIfNotEmpty(
          selection,
          'read_state',
          selected.filter((id) => id === 'read' || id === 'unread')
        );
        setIfNotEmpty(
          selection,
          facetId,
          selected.filter((id) => id === 'done' || id === 'not-done')
        );
        continue;
      }
      setIfNotEmpty(selection, facetId, selected);
    }
  }

  const parsedFilters = legacyFiltersSchema.safeParse(filters);
  if (!parsedFilters.success) return selection;
  const include = parsedFilters.data.include;
  if (!include) return selection;

  if (include.emailImportance !== undefined) {
    selection.email_importance = [
      include.emailImportance ? 'important' : 'noise',
    ];
  }
  setIfNotEmpty(selection, 'email_inbox', include.emailLinkId);
  setIfNotEmpty(selection, 'channel_in', include.channelId);
  setIfNotEmpty(selection, 'channel_from', include.channelSenderId);
  setIfNotEmpty(selection, 'call_in', include.callChannelId);
  setIfNotEmpty(selection, 'call_from', include.callSpeakerId);
  setIfNotEmpty(selection, 'task_created_by', include.documentOwnerId);

  const callStatus =
    include.callStatus ??
    (include.callAttended === true
      ? 'ATTENDED'
      : include.callAttended === false
        ? 'UNATTENDED'
        : undefined);
  if (callStatus) selection.call_status = [callStatus];

  const taskStatus: string[] = [];
  const taskPriority: string[] = [];
  const assignee: string[] = [];
  for (const property of include.properties ?? []) {
    if (
      property.propertyId === SYSTEM_PROPERTY_IDS.STATUS &&
      property.type === 'select'
    ) {
      const id = TASK_STATUS_IDS.get(property.value);
      if (id) taskStatus.push(id);
      continue;
    }
    if (
      property.propertyId === SYSTEM_PROPERTY_IDS.PRIORITY &&
      property.type === 'select'
    ) {
      const id = TASK_PRIORITY_IDS.get(property.value);
      if (id) taskPriority.push(id);
      continue;
    }
    if (
      property.propertyId === SYSTEM_PROPERTY_IDS.ASSIGNEES &&
      property.type === 'entity'
    ) {
      assignee.push(property.value);
    }
  }
  mergeIfNotEmpty(selection, 'task_status', taskStatus);
  mergeIfNotEmpty(selection, 'task_priority', taskPriority);
  setIfNotEmpty(selection, 'assignee', assignee);

  const tags = (include.tagFilters ?? []).map((filter) => filter.value);
  setIfNotEmpty(selection, 'tag', tags);
  if (tags.length > 0 && include.tagFilterMode === 'all') {
    selection.tag_mode = ['all'];
  }

  return selection;
}
