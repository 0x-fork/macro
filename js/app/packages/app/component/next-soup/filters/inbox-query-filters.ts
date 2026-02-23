import type { SoupItemsQueryFilters } from '@queries/soup/items';
import type { EntityFilters } from '@service-storage/generated/schemas';

const INBOX_DONE = false;
const INBOX_IMPORTANCE = true;
const INBOX_TASK_BYPASS = true;

const isNonEmptyObject = (obj: Record<string, unknown>) =>
  Object.keys(obj).length > 0;

type AllFilterTypes = NonNullable<EntityFilters[keyof EntityFilters]>;

function withInboxNotification(filters: AllFilterTypes | undefined): {
  notification_filters: { done: boolean };
} {
  return {
    ...filters,
    notification_filters: {
      ...filters?.notification_filters,
      done: INBOX_DONE,
    },
  };
}

function withoutInboxNotification(filters: AllFilterTypes | undefined):
  | (Omit<AllFilterTypes, 'notification_filters'> & {
      notification_filters?: Omit<
        AllFilterTypes['notification_filters'],
        'done'
      >;
    })
  | undefined {
  if (!filters) return undefined;
  const { notification_filters, ...rest } = filters;
  if (!notification_filters || notification_filters.done !== INBOX_DONE) {
    return filters as any;
  }
  const { done: _, ...notifRest } = notification_filters;
  const result = {
    ...rest,
    ...(isNonEmptyObject(notifRest) ? { notification_filters: notifRest } : {}),
  };
  return isNonEmptyObject(result as Record<string, unknown>)
    ? (result as any)
    : undefined;
}

/** Apply inbox query filters to any existing query filter set. */
export function applyInboxQueryFilters(
  filters: SoupItemsQueryFilters
): SoupItemsQueryFilters {
  return {
    ...filters,
    channel_filters: withInboxNotification(filters.channel_filters),
    chat_filters: withInboxNotification(filters.chat_filters),
    document_filters: {
      ...withInboxNotification(filters.document_filters),
      task_filters: {
        ...filters.document_filters?.task_filters,
        include_cbm_atm_nc: INBOX_TASK_BYPASS,
      },
    },
    email_filters: { ...filters.email_filters, importance: INBOX_IMPORTANCE },
  };
}

/** Removes inbox specific query filters keeping the rest in place */
export function removeInboxQueryFilters(
  filters: SoupItemsQueryFilters
): SoupItemsQueryFilters {
  const channel_filters = withoutInboxNotification(filters.channel_filters);
  const chat_filters = withoutInboxNotification(filters.chat_filters);

  const docWithoutNotif = withoutInboxNotification(filters.document_filters);
  const task_filters = filters.document_filters?.task_filters;
  const taskFiltersClean =
    task_filters?.include_cbm_atm_nc === INBOX_TASK_BYPASS
      ? (() => {
          const { include_cbm_atm_nc: _, ...rest } = task_filters;
          return isNonEmptyObject(rest) ? rest : undefined;
        })()
      : task_filters;
  const document_filters =
    docWithoutNotif || taskFiltersClean
      ? {
          ...docWithoutNotif,
          ...(taskFiltersClean ? { task_filters: taskFiltersClean } : {}),
        }
      : undefined;

  const { importance, ...emailRest } = filters.email_filters ?? {};
  const email_filters =
    importance === INBOX_IMPORTANCE
      ? isNonEmptyObject(emailRest)
        ? emailRest
        : undefined
      : filters.email_filters;

  return {
    ...filters,
    channel_filters,
    chat_filters,
    document_filters,
    email_filters,
  };
}
