import type { SoupItemsQueryFilters } from '@queries/soup/items';

const INBOX_DONE = false;
const INBOX_IMPORTANCE = true;
const INBOX_TASK_BYPASS = true;

const isNonEmptyObject = (obj: Record<string, unknown>) =>
  Object.keys(obj).length > 0;

const removeDoneNotificationFilter = (notificationFilters?: {
  done?: boolean | null;
  seen?: boolean | null;
}) => {
  if (!notificationFilters) return undefined;
  if (notificationFilters.done !== INBOX_DONE) return notificationFilters;

  const { done: _done, ...rest } = notificationFilters;
  return isNonEmptyObject(rest) ? rest : undefined;
};

/** Apply inbox query filters to any existing query filter set. */
export function applyInboxQueryFilters(
  filters: SoupItemsQueryFilters
): SoupItemsQueryFilters {
  return {
    ...filters,
    channel_filters: {
      ...filters.channel_filters,
      notification_filters: {
        ...filters.channel_filters?.notification_filters,
        done: INBOX_DONE,
      },
    },
    chat_filters: {
      ...filters.chat_filters,
      notification_filters: {
        ...filters.chat_filters?.notification_filters,
        done: INBOX_DONE,
      },
    },
    document_filters: {
      ...filters.document_filters,
      notification_filters: {
        ...filters.document_filters?.notification_filters,
        done: INBOX_DONE,
      },
      task_filters: {
        ...filters.document_filters?.task_filters,
        include_cbm_atm_nc: INBOX_TASK_BYPASS,
      },
    },
    email_filters: {
      ...filters.email_filters,
      importance: INBOX_IMPORTANCE,
    },
  };
}

/** Remove only inbox-added query filters from an existing query filter set. */
export function removeInboxQueryFilters(
  filters: SoupItemsQueryFilters
): SoupItemsQueryFilters {
  const { notification_filters: _cn, ...channelRest } =
    filters.channel_filters ?? {};
  const { notification_filters: _chatn, ...chatRest } =
    filters.chat_filters ?? {};
  const {
    notification_filters: _dn,
    task_filters,
    ...docRest
  } = filters.document_filters ?? {};
  const taskFiltersWithoutInboxBypass =
    task_filters?.include_cbm_atm_nc === INBOX_TASK_BYPASS
      ? (() => {
          const { include_cbm_atm_nc: _, ...rest } = task_filters;
          return rest;
        })()
      : task_filters;
  const { importance, ...emailRest } = filters.email_filters ?? {};

  const channelNotificationFilters = removeDoneNotificationFilter(
    filters.channel_filters?.notification_filters
  );
  const chatNotificationFilters = removeDoneNotificationFilter(
    filters.chat_filters?.notification_filters
  );
  const documentNotificationFilters = removeDoneNotificationFilter(
    filters.document_filters?.notification_filters
  );

  const channel_filters = {
    ...channelRest,
    ...(channelNotificationFilters
      ? { notification_filters: channelNotificationFilters }
      : {}),
  };
  const chat_filters = {
    ...chatRest,
    ...(chatNotificationFilters
      ? { notification_filters: chatNotificationFilters }
      : {}),
  };
  const document_filters = {
    ...docRest,
    ...(documentNotificationFilters
      ? { notification_filters: documentNotificationFilters }
      : {}),
    ...(taskFiltersWithoutInboxBypass &&
    isNonEmptyObject(taskFiltersWithoutInboxBypass)
      ? { task_filters: taskFiltersWithoutInboxBypass }
      : {}),
  };
  const email_filters =
    importance === INBOX_IMPORTANCE ? emailRest : { ...emailRest, importance };

  return {
    ...filters,
    channel_filters: isNonEmptyObject(channel_filters)
      ? channel_filters
      : undefined,
    chat_filters: isNonEmptyObject(chat_filters) ? chat_filters : undefined,
    document_filters: isNonEmptyObject(document_filters)
      ? document_filters
      : undefined,
    email_filters: isNonEmptyObject(email_filters) ? email_filters : undefined,
  };
}
