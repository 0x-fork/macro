import {
  type ApiSortMethod,
  type ApiThreadPreviewCursor,
  archiveThread,
  type PreviewViewStandardLabel,
  previewsInboxCursor,
} from '@service-email/client';
import { queryCollectionOptions } from '@tanstack/db-collections';
import { type Collection, createCollection } from '@tanstack/solid-db';
import { queryClient } from '../queries/client';
import { queryKeys } from '../queries/key';

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
 *
 * @param params - Collection parameters including view, limit, and sort method
 * @returns A TanStack DB collection of email previews
 *
 * @example
 * ```ts
 * import { useLiveQuery, eq } from '@tanstack/solid-db';
 *
 * const inboxCollection = createEmailPreviewsCollection({ view: 'inbox' });
 *
 * // Use with useLiveQuery for reactive filtered data
 * const unreadEmails = useLiveQuery((q) =>
 *   q.from({ emails: inboxCollection })
 *     .where(({ emails }) => eq(emails.isRead, false))
 *     .select(({ emails }) => emails)
 * );
 *
 * // Archive an email optimistically
 * inboxCollection.update(email._collectionKey, (draft) => {
 *   draft.inboxVisible = false;
 * });
 * ```
 */
export function createEmailPreviewsCollection(
  params: EmailCollectionParams
): Collection<EmailPreviewItem> {
  const { view, limit = 500, sortMethod = 'viewed_updated' } = params;

  const collectionId = `email-previews-${view}`;

  // Create collection options with TanStack Query integration
  // Using type assertion due to beta package type incompatibilities
  const options = queryCollectionOptions<EmailPreviewItem>({
    id: collectionId,
    queryClient: queryClient,
    queryKey: queryKeys.email({ view, limit, sort_method: sortMethod }),

    queryFn: async () => {
      const { data, error } = await previewsInboxCursor({
        path: { view },
        query: { limit, sort_method: sortMethod },
      });

      if (error || !data) {
        throw new Error('Failed to fetch email previews', { cause: error });
      }

      // Transform items to include collection key and view
      return data.items.map(
        (item): EmailPreviewItem => ({
          ...item,
          _collectionKey: `${view}:${item.id}`,
          _view: view,
        })
      );
    },

    getKey: (item) => item._collectionKey,

    // Handle archive/unarchive mutations
    onUpdate: async ({ transaction }) => {
      for (const mutation of transaction.mutations) {
        const item = mutation.modified as EmailPreviewItem;
        const original = mutation.original as EmailPreviewItem;

        // Handle inbox visibility changes (archive/unarchive)
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

    // Auto-refetch every 30 seconds when active
    refetchInterval: 30000,
    staleTime: 10000,
  });

  // Use type assertion to handle beta package type mismatches
  // TanStack DB is in beta and has type incompatibilities between packages
  return createCollection(
    options as unknown as Parameters<typeof createCollection>[0]
  ) as unknown as Collection<EmailPreviewItem>;
}

// Pre-created collections for common views (lazy singletons)
let _inboxCollection: Collection<EmailPreviewItem> | null = null;
let _allCollection: Collection<EmailPreviewItem> | null = null;
let _sentCollection: Collection<EmailPreviewItem> | null = null;
let _draftsCollection: Collection<EmailPreviewItem> | null = null;

/**
 * Get the inbox email previews collection (singleton)
 */
export function getInboxCollection(): Collection<EmailPreviewItem> {
  if (!_inboxCollection) {
    _inboxCollection = createEmailPreviewsCollection({ view: 'inbox' });
  }
  return _inboxCollection;
}

/**
 * Get the all-mail email previews collection (singleton)
 */
export function getAllMailCollection(): Collection<EmailPreviewItem> {
  if (!_allCollection) {
    _allCollection = createEmailPreviewsCollection({ view: 'all' });
  }
  return _allCollection;
}

/**
 * Get the sent email previews collection (singleton)
 */
export function getSentCollection(): Collection<EmailPreviewItem> {
  if (!_sentCollection) {
    _sentCollection = createEmailPreviewsCollection({ view: 'sent' });
  }
  return _sentCollection;
}

/**
 * Get the drafts email previews collection (singleton)
 */
export function getDraftsCollection(): Collection<EmailPreviewItem> {
  if (!_draftsCollection) {
    _draftsCollection = createEmailPreviewsCollection({ view: 'drafts' });
  }
  return _draftsCollection;
}
