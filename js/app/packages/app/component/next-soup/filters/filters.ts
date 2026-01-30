import {
  isTaskEntity,
  type EntityData,
  type WithNotification,
} from '@macro-entity';
import {
  signalFilter,
  noiseFilter,
  explicitNoiseFilter,
} from './signal-filters';
import {
  type EntityWithValidIcon,
  getIconConfig,
} from '@core/component/EntityIcon';

/**
 * Unread filter - entity has unread content.
 *
 * Entity-specific logic:
 * - Emails: Uses `isRead` boolean field
 * - Everything else: Has at least one notification with viewedAt === null
 */
export function unreadFilter(entity: EnhancedEntity): boolean {
  if (entity.type === 'email') {
    return !entity.isRead;
  }
  return entity.notifications?.()?.some((n) => !n.viewedAt) ?? false;
}

/**
 * NotDone filter - entity has outstanding items.
 *
 * Entity-specific logic:
 * - Emails: Uses `done` field (derived from !inboxVisible - email is "not done" when in inbox)
 * - Everything else: Has at least one notification with done === false
 */
export function notDoneFilter(entity: WithNotification<EntityData>) {
  if (entity.type === 'email') return !entity.done;
  // Tasks are handled by signalFilter based on assignee/status, not notifications
  if (isTaskEntity(entity)) return true;

  return (
    !!entity.notifications && entity.notifications().some(({ done }) => !done)
  );
}

/** Filter predicate function */
export type FilterPredicate<T> = (entity: T) => boolean;

/** Filter configuration */
export type FilterConfig<T> = {
  readonly id: string;
  readonly label: string;
  readonly predicate: FilterPredicate<T>;
  readonly group?: string;
};

/** Filter group for mutual exclusivity */
export type FilterGroup = {
  readonly id: string;
  readonly label: string;
  readonly filterIds: readonly string[];
  readonly allowMultiple?: boolean;
};

type EnhancedEntity = WithNotification<EntityData>;

/** Document filter (markdown, canvas) - excludes tasks */
export function documentFilter(entity: EntityData): boolean {
  if (entity.type !== 'document') return false;
  if (entity.subType?.type === 'task') return false;
  const fileType = entity.fileType ?? '';
  return fileType === 'md' || fileType === 'canvas';
}

/** Task filter */
export function taskFilter(entity: EntityData): boolean {
  return entity.type === 'document' && entity.subType?.type === 'task';
}

/** Email filter */
export function emailFilter(entity: EntityData): boolean {
  return entity.type === 'email';
}

/** People filter (direct messages) */
export function peopleFilter(entity: EntityData): boolean {
  return entity.type === 'channel' && entity.channelType === 'direct_message';
}

/** Teams filter (group channels) */
export function teamsFilter(entity: EntityData): boolean {
  return entity.type === 'channel' && entity.channelType !== 'direct_message';
}

/** Chat/agent filter */
export function agentFilter(entity: EntityData): boolean {
  return entity.type === 'chat';
}

/** Project/folder filter */
export function projectFilter(entity: EntityData): boolean {
  return entity.type === 'project';
}

/** File filter (non-markdown documents) */
export function fileFilter(entity: EntityData): boolean {
  if (entity.type !== 'document') return false;
  const fileType = entity.fileType ?? '';
  return !['md', 'canvas'].includes(fileType);
}

export const SOUP_FILTERS = [
  // Focus filters (mutually exclusive)
  {
    id: 'signal',
    label: 'Inbox',
    predicate: signalFilter,
    group: 'focus',
    shortcut: 'i',
  },
  {
    id: 'noise',
    label: 'Other',
    predicate: noiseFilter,
    group: 'focus',
    shortcut: 'i',
  },
  {
    id: 'explicit-noise',
    label: 'Explicit Noise',
    predicate: (entity: EntityData) => !explicitNoiseFilter(entity),
    group: 'focus',
  },

  // Notification filters
  {
    id: 'unread',
    label: 'Unread',
    predicate: unreadFilter,
    shortcut: 'u',
  },
  {
    id: 'not-done',
    label: 'Not done',
    predicate: notDoneFilter,
  },

  // Entity type filters (mutually exclusive)
  {
    id: 'document',
    label: 'Docs',
    predicate: documentFilter,
    group: 'type',
    shortcut: 'd',
  },
  {
    id: 'task',
    label: 'Tasks',
    predicate: taskFilter,
    group: 'type',
    shortcut: 't',
  },
  {
    id: 'email',
    label: 'Mail',
    predicate: emailFilter,
    group: 'type',
    shortcut: 'l',
  },
  {
    id: 'people',
    label: 'People',
    predicate: peopleFilter,
    group: 'type',
    shortcut: 'p',
  },
  {
    id: 'teams',
    label: 'Teams',
    predicate: teamsFilter,
    group: 'type',
    shortcut: 'm',
  },
  {
    id: 'agent',
    label: 'Agents',
    predicate: agentFilter,
    group: 'type',
    shortcut: 'a',
  },
  {
    id: 'file',
    label: 'Files',
    predicate: fileFilter,
    group: 'type',
    shortcut: 'f',
  },
] as const;

export type FilterID = (typeof SOUP_FILTERS)[number]['id'];

const ENTITY_TYPE_FILTERS = [
  'document',
  'task',
  'email',
  'people',
  'teams',
  'agent',
  'file',
] as const;

type EntityTypeFilters = (typeof ENTITY_TYPE_FILTERS)[number];

export const isEntityTypeFilter = (
  filter: FilterConfig<EntityData>
): filter is Extract<
  (typeof SOUP_FILTERS)[number],
  { readonly id: EntityTypeFilters }
> => {
  return ENTITY_TYPE_FILTERS.includes(filter.id as EntityTypeFilters);
};

export const ENTITY_TYPE_FILTER_CONFIGS = SOUP_FILTERS.filter((f) =>
  isEntityTypeFilter(f)
);

const ENTITY_TYPE_TO_ICON_TYPE: Record<EntityTypeFilters, EntityWithValidIcon> =
  {
    document: 'md',
    email: 'email',
    task: 'task',
    people: 'channel',
    teams: 'directMessage',
    agent: 'chat',
    file: 'project',
  };

export const getEntityTypeFilterIcon = (filter: EntityTypeFilters) => {
  return getIconConfig(ENTITY_TYPE_TO_ICON_TYPE[filter]);
};

export const getFilterWithID = (filterID: FilterID) => {
  const found = SOUP_FILTERS.find((f) => f.id === filterID);

  if (!found) return;

  return found;
};

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const buildDssFiltersRequest = (
  filters: FilterConfig<EntityData>[],
  context?: {
    isSearchActive?: boolean;
    emailActive?: boolean;
  }
) => {
  const entityTypes = filters
    .filter((f) => ENTITY_TYPE_FILTERS.includes(f.id as EntityTypeFilters))
    .map((f) => f.id);

  return {
    channel_filters: {
      channel_ids:
        entityTypes.includes('teams') ||
        entityTypes.includes('people') ||
        entityTypes.length === 0
          ? []
          : [NIL_UUID],
    },
    document_filters: {
      document_ids:
        entityTypes.includes('document') ||
        entityTypes.includes('task') ||
        entityTypes.length === 0
          ? []
          : [NIL_UUID],
      project_ids: [],
      file_types: [],
    },
    chat_filters: {
      chat_ids:
        entityTypes.includes('chat') || entityTypes.length === 0
          ? []
          : [NIL_UUID],
      project_ids: [],
    },
    email_filters: {
      recipients:
        context?.emailActive &&
        !context.isSearchActive &&
        (entityTypes.includes('email') || entityTypes.length === 0)
          ? []
          : [NIL_UUID],
    },
    project_filters: {
      project_ids:
        entityTypes.includes('project') || entityTypes.length === 0
          ? []
          : [NIL_UUID],
    },
    emailView: 'all',
  };
};
