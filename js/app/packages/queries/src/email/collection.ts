import { queryCollectionOptions } from '@tanstack/db-collections';
import { type Collection, createCollection } from '@tanstack/solid-db';
import { eq, useLiveQuery } from '@tanstack/solid-db';
import { type Accessor, createMemo } from 'solid-js';
import { queryClient } from '../client';
import {
  type ApiSortMethod,
  type ApiThreadPreviewCursor,
  archiveThread,
  type PreviewViewStandardLabel,
  previewsInboxCursor,
} from './client';
import { emailKeys } from './keys';

/**
 * Email thread preview collection item type
 *
 * Extends the API type with collection-specific metadata
 */
export type EmailPreviewItem = ApiThreadPreviewCursor & {
  /** Composite key for collection: `${view}:${id}` */
  _collectionKey: string;
  /** The view this preview belongs to */
  _view: PreviewViewStandardLabel;
};

export type EmailCollectionParams = {
  view: PreviewViewStandardLabel;
  limit?: number;
  sortMethod?: ApiSortMethod;
};

/**
 * Creates an email previews collection for a specific view.
 *
 * This collection stores normalized email thread previews backed by TanStack Query.
 * It provides:
 * - Automatic sync with the server via TanStack Query
 * - Live queries for filtering/sorting without re-fetching
 * - Optimistic updates for archive/unarchive operations
 */
export function createEmailPreviewsCollection(
  params: EmailCollectionParams
): Collection<EmailPreviewItem> {
  const { view, limit = 500, sortMethod = 'viewed_updated' } = params;

  const collectionId = `email-previews-${view}`;

  const options = queryCollectionOptions<EmailPreviewItem>({
    id: collectionId,
    queryClient: queryClient,
    queryKey: emailKeys.previews({ view, limit, sort_method: sortMethod })
      .queryKey,

    queryFn: async () => {
      const { data, error } = await previewsInboxCursor({
        path: { view },
        query: { limit, sort_method: sortMethod },
      });

      if (error || !data) {
        throw new Error('Failed to fetch email previews', { cause: error });
      }

      return data.items.map(
        (item): EmailPreviewItem => ({
          ...item,
          _collectionKey: `${view}:${item.id}`,
          _view: view,
        })
      );
    },

    getKey: (item) => item._collectionKey,

    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        const item = mutation.modified as EmailPreviewItem;
        const original = mutation.original as EmailPreviewItem;

        if (original.inboxVisible !== item.inboxVisible) {
          const { error } = await archiveThread({
            path: { id: item.id },
            body: { value: !item.inboxVisible },
          });

          if (error) {
            throw new Error('Failed to archive thread', { cause: error });
          }
        }
      }
    },

    refetchInterval: 30000,
    staleTime: 10000,
  });

  return createCollection(
    options as unknown as Parameters<typeof createCollection>[0]
  ) as unknown as Collection<EmailPreviewItem>;
}

// Pre-created collections for common views (lazy singletons)
let _inboxCollection: Collection<EmailPreviewItem> | null = null;
let _allCollection: Collection<EmailPreviewItem> | null = null;
let _sentCollection: Collection<EmailPreviewItem> | null = null;
let _draftsCollection: Collection<EmailPreviewItem> | null = null;

export function getInboxCollection(): Collection<EmailPreviewItem> {
  if (!_inboxCollection) {
    _inboxCollection = createEmailPreviewsCollection({ view: 'inbox' });
  }
  return _inboxCollection;
}

export function getAllMailCollection(): Collection<EmailPreviewItem> {
  if (!_allCollection) {
    _allCollection = createEmailPreviewsCollection({ view: 'all' });
  }
  return _allCollection;
}

export function getSentCollection(): Collection<EmailPreviewItem> {
  if (!_sentCollection) {
    _sentCollection = createEmailPreviewsCollection({ view: 'sent' });
  }
  return _sentCollection;
}

export function getDraftsCollection(): Collection<EmailPreviewItem> {
  if (!_draftsCollection) {
    _draftsCollection = createEmailPreviewsCollection({ view: 'drafts' });
  }
  return _draftsCollection;
}

// useEmailCollection hook

export type EmailFilterOptions = {
  unreadOnly?: boolean;
  importantOnly?: boolean;
  searchText?: string;
};

export function useEmailCollection(
  params: EmailCollectionParams,
  filters?: Accessor<EmailFilterOptions>
) {
  const collection = createEmailPreviewsCollection(params);

  const allEmailsQuery = useLiveQuery((q) =>
    q.from({ emails: collection }).select(({ emails }) => emails)
  );

  const unreadEmailsQuery = useLiveQuery((q) =>
    q
      .from({ emails: collection })
      .where(({ emails }) => eq(emails.isRead, false))
      .select(({ emails }) => emails)
  );

  const importantEmailsQuery = useLiveQuery((q) =>
    q
      .from({ emails: collection })
      .where(({ emails }) => eq(emails.isImportant, true))
      .select(({ emails }) => emails)
  );

  const filteredEmails = createMemo(() => {
    const filterOpts = filters?.() ?? {};
    let items: EmailPreviewItem[];

    if (filterOpts.unreadOnly && filterOpts.importantOnly) {
      const unreadIds = new Set(unreadEmailsQuery.data.map((e) => e.id));
      items = importantEmailsQuery.data.filter((e) => unreadIds.has(e.id));
    } else if (filterOpts.unreadOnly) {
      items = unreadEmailsQuery.data;
    } else if (filterOpts.importantOnly) {
      items = importantEmailsQuery.data;
    } else {
      items = allEmailsQuery.data;
    }

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

  const unreadCount = createMemo(() => unreadEmailsQuery.data.length);
  const importantCount = createMemo(() => importantEmailsQuery.data.length);
  const totalCount = createMemo(() => allEmailsQuery.data.length);

  const isLoading = createMemo(
    () =>
      allEmailsQuery.isLoading() ||
      unreadEmailsQuery.isLoading() ||
      importantEmailsQuery.isLoading()
  );

  const archiveEmail = (emailKey: string) => {
    collection.update(emailKey, (draft) => {
      draft.inboxVisible = false;
    });
  };

  const markAsRead = (emailKey: string) => {
    collection.update(emailKey, (draft) => {
      draft.isRead = true;
    });
  };

  const toggleImportant = (emailKey: string) => {
    collection.update(emailKey, (draft) => {
      draft.isImportant = !draft.isImportant;
    });
  };

  return {
    emails: filteredEmails,
    allEmails: () => allEmailsQuery.data,
    unreadCount,
    importantCount,
    totalCount,
    isLoading,
    isReady: allEmailsQuery.isReady,
    archiveEmail,
    markAsRead,
    toggleImportant,
    collection,
  };
}
