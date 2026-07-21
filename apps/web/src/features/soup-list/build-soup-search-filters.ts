import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import type {
  EntityFilters,
  PropertyFilter,
} from '@service-search/generated/models';
import type { FacetSelection } from './facet-store';
import { NIL_UUID } from './facet-store';
import { NO_ASSIGNEE } from './facets/base';
import { DOCUMENT_SEARCH_FILE_TYPES } from './facets/documents';
import { isSearchTaggableType } from './search-type-capabilities';

type SearchTypeValue =
  | 'all'
  | 'email'
  | 'channels'
  | 'calls'
  | 'task'
  | 'document-or-file'
  | 'folders'
  | 'agent'
  | 'doc-snippet';
type CallStatus = 'ATTENDED' | 'MISSED' | 'UNATTENDED';

const TASK_STATUS_VALUES: Record<string, string> = {
  'task-not-started': PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
  'task-in-progress': PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
  'task-in-review': PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
  'task-completed': PROPERTY_OPTION_IDS.STATUS.COMPLETED,
  'task-canceled': PROPERTY_OPTION_IDS.STATUS.CANCELED,
};

const TASK_PRIORITY_VALUES: Record<string, string> = {
  'task-urgent': PROPERTY_OPTION_IDS.PRIORITY.URGENT,
  'task-high-priority': PROPERTY_OPTION_IDS.PRIORITY.HIGH,
  'task-medium-priority': PROPERTY_OPTION_IDS.PRIORITY.MEDIUM,
  'task-low-priority': PROPERTY_OPTION_IDS.PRIORITY.LOW,
};

// Map the tasks-view property filters (status/priority/assignee/custom) into the
// search request shape, mirroring the soup path so search and soup agree. Values
// are grouped by property id: multiple values on one property are OR'd (a task
// matches any of them), and different properties are AND'd. Select options go to
// option_ids, entity refs to entity_ids.
function includePropertiesToFilters(
  properties:
    | readonly {
        propertyId: string;
        type: 'select' | 'entity';
        value: string;
      }[]
    | undefined
): PropertyFilter[] {
  if (!properties?.length) return [];
  const byPropId = new Map<string, PropertyFilter>();
  for (const p of properties) {
    let filter = byPropId.get(p.propertyId);
    if (!filter) {
      filter = { property_definition_id: p.propertyId };
      byPropId.set(p.propertyId, filter);
    }
    if (p.type === 'select') {
      filter.option_ids = [...(filter.option_ids ?? []), p.value];
    } else {
      filter.entity_ids = [...(filter.entity_ids ?? []), p.value];
    }
  }
  return [...byPropId.values()];
}

// The "match nothing" id field per entity group — used to NIL-exclude every
// group except the active search type's (so search scopes to one entity type).
const NIL_FIELD = {
  document_filters: 'document_ids',
  email_filters: 'email_thread_ids',
  channel_filters: 'channel_ids',
  channel_thread_filters: 'thread_ids',
  chat_filters: 'chat_ids',
  project_filters: 'project_ids',
  call_filters: 'call_ids',
  foreign_entity_filters: 'ids',
} as const;

type EntityGroup = keyof typeof NIL_FIELD;

const ACTIVE_GROUP: Record<SearchTypeValue, EntityGroup | null> = {
  all: null,
  email: 'email_filters',
  channels: 'channel_filters',
  calls: 'call_filters',
  task: 'document_filters',
  'document-or-file': 'document_filters',
  folders: 'project_filters',
  agent: 'chat_filters',
  'doc-snippet': 'document_filters',
};

export function buildSearchEntityFilters(
  selection: Partial<FacetSelection>,
  context: { userId?: string } = {}
): EntityFilters {
  const {
    search_type: searchType = [],
    scope = [],
    agents = [],
    mail = [],
    documents = [],
    tasks = [],
    channels = [],
    folders = [],
    calls = [],
    type: documentTypes = [],
    email_importance: emailImportance = [],
    email_inbox: emailInbox = [],
    channel_in: channelIn = [],
    channel_from: channelFrom = [],
    call_in: callIn = [],
    call_from: callFrom = [],
    call_status: callStatus = [],
    task_status: taskStatus = [],
    task_priority: taskPriority = [],
    assignee = [],
    task_created_by: taskCreatedBy = [],
    read_state: readState = [],
    channel_thread_scope: channelThreadScope = [],
    tag = [],
    tag_mode: tagMode = [],
  } = selection;

  const scopeType: Partial<Record<string, SearchTypeValue>> = {
    email: 'email',
    agent: 'agent',
    automation: 'agent',
    people: 'channels',
    teams: 'channels',
    task: 'task',
    channels: 'channels',
    folders: 'folders',
    calls: 'calls',
    'document-or-file': 'document-or-file',
    'doc-snippet': 'doc-snippet',
  };
  const type =
    (searchType[0] as SearchTypeValue | undefined) ??
    scopeType[scope[0] ?? ''] ??
    'all';
  const crmOnly =
    scope.includes('crm-company-active') ||
    scope.includes('crm-company-hidden');

  const active = ACTIVE_GROUP[type];
  const filters: EntityFilters =
    type === 'all' ? { foreign_entity_filters: { ids: [NIL_UUID] } } : {};

  if (type !== 'all' || crmOnly) {
    for (const group of Object.keys(NIL_FIELD) as EntityGroup[]) {
      if (!crmOnly && group === active) continue;
      filters[group] = { [NIL_FIELD[group]]: [NIL_UUID] };
    }
  }

  switch (type) {
    case 'email': {
      const ef: NonNullable<EntityFilters['email_filters']> = {};

      if (emailImportance.includes('important')) ef.importance = true;
      else if (emailImportance.includes('noise')) ef.importance = false;
      if (emailInbox.length) ef.link_ids = emailInbox;

      if (Object.keys(ef).length) filters.email_filters = ef;

      break;
    }

    case 'channels': {
      const cf: NonNullable<EntityFilters['channel_filters']> = {};

      if (channelIn.length) cf.channel_ids = channelIn;
      if (channelFrom.length) cf.sender_ids = channelFrom;

      if (Object.keys(cf).length) filters.channel_filters = cf;

      break;
    }

    case 'calls': {
      const cf: NonNullable<EntityFilters['call_filters']> = {};

      if (callIn.length) cf.channel_ids = callIn;
      if (callFrom.length) cf.speaker_ids = callFrom;

      const status = callStatus[0] as CallStatus | undefined;
      if (status) cf.status = status;

      if (Object.keys(cf).length) filters.call_filters = cf;

      break;
    }

    case 'doc-snippet': {
      filters.document_filters = {
        file_types: ['md'],
        sub_types: ['snippet'],
      };
      break;
    }

    case 'task': {
      const df: NonNullable<EntityFilters['document_filters']> = {
        sub_types: ['task'],
      };

      if (taskCreatedBy.length) df.owners = taskCreatedBy;

      filters.document_filters = df;

      const properties = includePropertiesToFilters([
        ...taskStatus.flatMap((id) => {
          const value = TASK_STATUS_VALUES[id];
          return value
            ? [
                {
                  propertyId: SYSTEM_PROPERTY_IDS.STATUS,
                  type: 'select' as const,
                  value,
                },
              ]
            : [];
        }),
        ...taskPriority.flatMap((id) => {
          const value = TASK_PRIORITY_VALUES[id];
          return value
            ? [
                {
                  propertyId: SYSTEM_PROPERTY_IDS.PRIORITY,
                  type: 'select' as const,
                  value,
                },
              ]
            : [];
        }),
        ...(assignee.includes(NO_ASSIGNEE)
          ? []
          : assignee.map((value) => ({
              propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
              type: 'entity' as const,
              value,
            }))),
      ]);

      if (properties.length) filters.property_filters = properties;

      break;
    }
  }

  const userId = context.userId;
  const agentTab = agents[0];
  if (userId && (agentTab === 'owned' || agentTab === 'running')) {
    filters.chat_filters = { ...filters.chat_filters, owners: [userId] };
  }

  const mailTab = mail[0];
  if (mailTab === 'important' || mailTab === 'noise') {
    filters.email_filters = {
      ...filters.email_filters,
      importance: mailTab === 'important',
      shared: 'exclude',
    };
  } else if (mailTab === 'calendar') {
    filters.email_filters = {
      ...filters.email_filters,
      calendar_only: true,
      shared: 'exclude',
    };
  } else if (mailTab === 'shared') {
    filters.email_filters = { ...filters.email_filters, shared: 'only' };
  }

  const selectedFileTypes = documentTypes.flatMap(
    (id) => DOCUMENT_SEARCH_FILE_TYPES[id] ?? []
  );
  if (selectedFileTypes.length) {
    filters.document_filters = {
      ...filters.document_filters,
      file_types: [...new Set(selectedFileTypes)],
    };
  }
  const documentsTab = documents[0];
  if (documentsTab === 'attachments') {
    filters.document_filters = {
      ...filters.document_filters,
      is_email_attachment: true,
    };
  } else if (userId && documentsTab === 'owned') {
    filters.document_filters = {
      ...filters.document_filters,
      owners: [userId],
    };
  }

  const taskTab = tasks[0];
  if (userId && taskTab === 'assigned-to-me') {
    const assigneeFilter = includePropertiesToFilters([
      {
        propertyId: SYSTEM_PROPERTY_IDS.ASSIGNEES,
        type: 'entity',
        value: userId,
      },
    ]);
    filters.property_filters = [
      ...(filters.property_filters ?? []),
      ...assigneeFilter,
    ];
  } else if (userId && taskTab === 'created-by-me') {
    filters.document_filters = {
      ...filters.document_filters,
      owners: [userId],
    };
  }

  if (userId && folders[0] === 'owned') {
    filters.project_filters = {
      ...filters.project_filters,
      owners: [userId],
    };
  }

  const channelTab =
    channels[0] ??
    (scope[0] === 'people' || scope[0] === 'teams' ? scope[0] : undefined);
  if (channelTab === 'recent') {
    filters.channel_filters = {
      ...filters.channel_filters,
      importance: true,
    };
  } else if (channelTab === 'people' || channelTab === 'teams') {
    filters.channel_filters = {
      ...filters.channel_filters,
      channel_types:
        channelTab === 'people'
          ? ['direct_message']
          : ['public', 'private', 'team'],
    };
  }

  const callsTab = calls[0];
  if (callsTab === 'missed' || callsTab === 'unattended') {
    filters.call_filters = {
      ...filters.call_filters,
      status: callsTab === 'missed' ? 'MISSED' : 'UNATTENDED',
    };
  }

  if (emailInbox.length) {
    filters.email_filters = {
      ...filters.email_filters,
      link_ids: emailInbox,
    };
  }

  const threadScope = channelThreadScope[0];
  filters.channel_thread_filters = threadScope
    ? threadScope === NIL_UUID
      ? { thread_ids: [NIL_UUID] }
      : { participant_ids: [threadScope] }
    : (filters.channel_thread_filters ?? { thread_ids: [NIL_UUID] });

  const selectedCallStatus = callStatus[0] as CallStatus | undefined;
  if (selectedCallStatus) {
    filters.call_filters = {
      ...filters.call_filters,
      status: selectedCallStatus,
    };
  }

  const read = readState[0];
  if (read === 'read' || read === 'unread') {
    const notification_filters = { seen: read === 'read' };
    filters.document_filters = {
      ...filters.document_filters,
      notification_filters,
    };
    filters.email_filters = {
      ...filters.email_filters,
      notification_filters,
    };
    filters.channel_filters = {
      ...filters.channel_filters,
      notification_filters,
    };
    filters.chat_filters = {
      ...filters.chat_filters,
      notification_filters,
    };
    filters.project_filters = {
      ...filters.project_filters,
      notification_filters,
    };
    filters.foreign_entity_filters = {
      ...filters.foreign_entity_filters,
      notification_filters,
    };
  }

  // Tags: match on the option ids alone (globally unique), OR'd across all tag
  // definitions. No definition id is sent — the backend matches values only.
  // Gated to TAG_SEARCH_TYPES (taggable result types) so a tag selection never
  // silently empties a channel/call search.
  if (isSearchTaggableType(type) && tag.length) {
    filters.tag_option_ids = tag;
    if (tagMode.includes('all')) filters.tag_filter_mode = 'all';
  }

  return filters;
}
