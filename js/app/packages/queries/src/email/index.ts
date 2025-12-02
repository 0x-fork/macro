// Email client (configured with auth)
export { emailClient } from './client';

// Re-export all generated types, query options, and SDK functions
export type * from './client';
export {
  // Query options
  addRemoveLabelMutation,
  archiveThreadMutation,
  cancelBackfillGmailMutation,
  createDraftMutation,
  createLabelMutation,
  deleteDraftMutation,
  deleteLabelMutation,
  disableSyncMutation,
  enableSyncMutation,
  getAttachmentOptions,
  getAttachmentQueryKey,
  getBackfillGmailActiveOptions,
  getBackfillGmailActiveQueryKey,
  getBackfillGmailOptions,
  getBackfillGmailQueryKey,
  getMessageOptions,
  getMessageQueryKey,
  getMessagesBatchMutation,
  getThreadInfiniteOptions,
  getThreadInfiniteQueryKey,
  getThreadMessagesHandlerOptions,
  getThreadMessagesHandlerQueryKey,
  getThreadOptions,
  getThreadQueryKey,
  healthHandlerOptions,
  healthHandlerQueryKey,
  initUserMutation,
  listContactsOptions,
  listContactsQueryKey,
  listLabelsOptions,
  listLabelsQueryKey,
  listLinksOptions,
  listLinksQueryKey,
  previewsInboxCursorInfiniteOptions,
  previewsInboxCursorInfiniteQueryKey,
  previewsInboxCursorOptions,
  previewsInboxCursorQueryKey,
  sendMessageMutation,
  threadSeenMutation,
  // SDK functions
  addRemoveLabel,
  archiveThread,
  cancelBackfillGmail,
  createDraft,
  createLabel,
  deleteDraft,
  deleteLabel,
  disableSync,
  enableSync,
  getAttachment,
  getBackfillGmail,
  getBackfillGmailActive,
  getMessage,
  getMessagesBatch,
  getThread,
  getThreadMessagesHandler,
  healthHandler,
  initUser,
  listContacts,
  listLabels,
  listLinks,
  previewsInboxCursor,
  sendMessage,
  threadSeen,
  // Helpers
  unwrapResponse,
  type ThreadResponse,
  type AttachmentResponse,
  type LinksResponse,
  type ContactsResponse,
  type MessageToSendDbId,
} from './client';

// Query keys
export { emailKeys } from './keys';

// Custom queries
export {
  createEmailsInfiniteQuery,
  createThreadQuery,
  fetchAndCacheThread,
  getCachedThread,
  invalidateAllEmailQueries,
  invalidateCachedThread,
  optimisticMarkEmailAsRead,
  updateCachedThread,
  type EmailEntity,
  type FetchPaginatedEmailsParams,
} from './queries';

// Collections
export {
  createEmailPreviewsCollection,
  getAllMailCollection,
  getDraftsCollection,
  getInboxCollection,
  getSentCollection,
  useEmailCollection,
  type EmailCollectionParams,
  type EmailFilterOptions,
  type EmailPreviewItem,
} from './collection';

// Debounced seen
export {
  cancelAllPendingSeenCalls,
  debouncedThreadSeen,
  immediateThreadSeen,
} from './seen';
