import type { SoupItemsQueryFilters } from '@queries/soup/items';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

type BackendFilterState = {
  inboxActive: boolean;
  notDoneActive: boolean;
  unreadActive: boolean;
};

const isDocumentTypeExcluded = (filters: SoupItemsQueryFilters) => {
  const ids = filters.document_filters?.document_ids;
  return Array.isArray(ids) && ids.length === 1 && ids[0] === NIL_UUID;
};

/**
 * Compose backend-only inbox/unread filters on top of base query filters.
 * Frontend predicates remain as a fallback, while backend filters reduce over-fetching.
 */
export const composeBackendSoupFilters = (
  baseFilters: SoupItemsQueryFilters,
  state: BackendFilterState
): SoupItemsQueryFilters => {
  const inboxNotDoneActive = state.inboxActive && state.notDoneActive;
  const unreadActive = state.unreadActive;

  if (!inboxNotDoneActive && !unreadActive) {
    return baseFilters;
  }

  const notificationPatch = {
    ...(inboxNotDoneActive ? { done: false } : {}),
    ...(unreadActive ? { seen: false } : {}),
  };

  const shouldIncludeTaskBypass =
    inboxNotDoneActive && !isDocumentTypeExcluded(baseFilters);

  return {
    ...baseFilters,
    document_filters: {
      ...baseFilters.document_filters,
      notification_filters: {
        ...baseFilters.document_filters?.notification_filters,
        ...notificationPatch,
      },
      ...(shouldIncludeTaskBypass
        ? {
            task_filters: {
              ...baseFilters.document_filters?.task_filters,
              include_cbm_atm_nc: true,
            },
          }
        : {}),
    },
    chat_filters: {
      ...baseFilters.chat_filters,
      notification_filters: {
        ...baseFilters.chat_filters?.notification_filters,
        ...notificationPatch,
      },
    },
    project_filters: {
      ...baseFilters.project_filters,
      notification_filters: {
        ...baseFilters.project_filters?.notification_filters,
        ...notificationPatch,
      },
    },
    channel_filters: {
      ...baseFilters.channel_filters,
      notification_filters: {
        ...baseFilters.channel_filters?.notification_filters,
        ...notificationPatch,
      },
    },
  };
};
