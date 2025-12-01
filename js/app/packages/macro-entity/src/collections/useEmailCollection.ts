import { useLiveQuery, eq } from '@tanstack/solid-db';
import { createMemo, type Accessor } from 'solid-js';
import {
  createEmailPreviewsCollection,
  type EmailPreviewItem,
  type EmailCollectionParams,
} from './email';

export type EmailFilterOptions = {
  unreadOnly?: boolean;
  importantOnly?: boolean;
  searchText?: string;
};

/**
 * Hook to use email collection with TanStack DB live queries.
 *
 * This provides client-side filtering and sorting without re-fetching from the server.
 * The collection automatically syncs with TanStack Query in the background.
 *
 * @example
 * ```tsx
 * function EmailList() {
 *   const [filters, setFilters] = createSignal<EmailFilterOptions>({});
 *
 *   const { emails, unreadCount } = useEmailCollection(
 *     { view: 'inbox' },
 *     () => filters()
 *   );
 *
 *   return (
 *     <div>
 *       <p>Unread: {unreadCount()}</p>
 *       <For each={emails()}>
 *         {(email) => <EmailRow email={email} />}
 *       </For>
 *     </div>
 *   );
 * }
 * ```
 */
export function useEmailCollection(
  params: EmailCollectionParams,
  filters?: Accessor<EmailFilterOptions>
) {
  // Create the collection (this connects to TanStack Query)
  const collection = createEmailPreviewsCollection(params);

  // All emails query - no filters
  const allEmailsQuery = useLiveQuery((q) =>
    q.from({ emails: collection }).select(({ emails }) => emails)
  );

  // Unread emails query
  const unreadEmailsQuery = useLiveQuery((q) =>
    q
      .from({ emails: collection })
      .where(({ emails }) => eq(emails.isRead, false))
      .select(({ emails }) => emails)
  );

  // Important emails query
  const importantEmailsQuery = useLiveQuery((q) =>
    q
      .from({ emails: collection })
      .where(({ emails }) => eq(emails.isImportant, true))
      .select(({ emails }) => emails)
  );

  // Filtered emails based on current filter options
  const filteredEmails = createMemo(() => {
    const filterOpts = filters?.() ?? {};
    let items: EmailPreviewItem[];

    if (filterOpts.unreadOnly && filterOpts.importantOnly) {
      // Both filters - intersect the results
      const unreadIds = new Set(unreadEmailsQuery.data.map((e) => e.id));
      items = importantEmailsQuery.data.filter((e) => unreadIds.has(e.id));
    } else if (filterOpts.unreadOnly) {
      items = unreadEmailsQuery.data;
    } else if (filterOpts.importantOnly) {
      items = importantEmailsQuery.data;
    } else {
      items = allEmailsQuery.data;
    }

    // Apply text search filter (client-side)
    const searchText = filterOpts.searchText?.toLowerCase();
    if (searchText) {
      items = items.filter(
        (email) =>
          email.name?.toLowerCase().includes(searchText) ||
          email.snippet?.toLowerCase().includes(searchText) ||
          email.senderName?.toLowerCase().includes(searchText) ||
          email.senderEmail?.toLowerCase().includes(searchText)
      );
    }

    return items;
  });

  // Computed counts
  const unreadCount = createMemo(() => unreadEmailsQuery.data.length);
  const importantCount = createMemo(() => importantEmailsQuery.data.length);
  const totalCount = createMemo(() => allEmailsQuery.data.length);

  // Loading state
  const isLoading = createMemo(
    () =>
      allEmailsQuery.isLoading() ||
      unreadEmailsQuery.isLoading() ||
      importantEmailsQuery.isLoading()
  );

  // Archive an email (optimistic update via collection)
  const archiveEmail = (emailKey: string) => {
    collection.update(emailKey, (draft) => {
      draft.inboxVisible = false;
    });
  };

  // Mark as read (optimistic update)
  const markAsRead = (emailKey: string) => {
    collection.update(emailKey, (draft) => {
      draft.isRead = true;
    });
  };

  // Toggle important (optimistic update)
  const toggleImportant = (emailKey: string) => {
    collection.update(emailKey, (draft) => {
      draft.isImportant = !draft.isImportant;
    });
  };

  return {
    // Data
    emails: filteredEmails,
    allEmails: () => allEmailsQuery.data,

    // Stats (reactive)
    unreadCount,
    importantCount,
    totalCount,

    // State
    isLoading,
    isReady: allEmailsQuery.isReady,

    // Actions
    archiveEmail,
    markAsRead,
    toggleImportant,

    // Raw collection for advanced use cases
    collection,
  };
}
