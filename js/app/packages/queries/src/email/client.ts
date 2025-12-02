/**
 * Email Service Client
 *
 * Configured hey-api client for the email service with automatic Bearer token auth.
 */

import { SERVER_HOSTS } from '@core/constant/servers';
import { authInterceptor } from '../service-client';
import { client } from './generated/client.gen';

// Configure the generated client with base URL
client.setConfig({
  baseUrl: SERVER_HOSTS['email-service'],
});

// Add shared auth interceptor
authInterceptor(client);

// Export the configured client instance
export { client as emailClient };

// Re-export all TanStack Query options for reactive queries
export {
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
  type QueryKey,
  sendMessageMutation,
  threadSeenMutation,
} from './generated/@tanstack/solid-query.gen';

// Re-export all SDK functions for direct API calls
export {
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
} from './generated/sdk.gen';

// Re-export all types
export type * from './generated/types.gen';

// Type alias for backward compatibility
export type MessageToSendDbId = string | null;

import type {
  GetAttachmentResponse,
  GetThreadResponse,
  ListContactsResponse,
  ListLinksResponse,
} from './generated/types.gen';

// Helper to unwrap array responses from SDK calls
export function unwrapResponse<T>(response: { data?: T[]; error?: unknown }): {
  data: T | undefined;
  error: unknown;
} {
  return {
    data: response.data?.[0],
    error: response.error,
  };
}

// Corrected type exports
export type ThreadResponse = GetThreadResponse;
export type AttachmentResponse = GetAttachmentResponse;
export type LinksResponse = ListLinksResponse;
export type ContactsResponse = ListContactsResponse;
