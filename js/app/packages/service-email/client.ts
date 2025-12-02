/**
 * Email Service Client
 *
 * This module provides a configured hey-api client for the email service
 * with automatic authentication via Bearer token.
 *
 * ## Queries (for reads):
 * ```ts
 * import { createQuery } from '@tanstack/solid-query';
 * import { getThreadOptions } from '@service-email/client';
 *
 * const threadQuery = createQuery(() =>
 *   getThreadOptions({ path: { id: threadId }, query: { offset: 0, limit: 5 } })
 * );
 * ```
 *
 * ## Mutations (for writes):
 * ```ts
 * import { createMutation } from '@tanstack/solid-query';
 * import { sendMessageMutation } from '@service-email/client';
 *
 * const mutation = createMutation(() => sendMessageMutation());
 * mutation.mutate({ body: { message: messageData } });
 * ```
 *
 * ## Direct SDK calls (for imperative code):
 * ```ts
 * import { sendMessage } from '@service-email/client';
 *
 * const { data, error } = await sendMessage({ body: { message: messageData } });
 * ```
 */

import { SERVER_HOSTS } from '@core/constant/servers';
import { getMacroApiToken } from '@service-auth/fetch';
import { client } from './generated/client.gen';

// Configure the generated client with base URL and auth
client.setConfig({
  baseUrl: SERVER_HOSTS['email-service'],
});

// Add auth interceptor
client.interceptors.request.use(async (request) => {
  try {
    const token = await getMacroApiToken();
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }
  } catch (error) {
    console.error('Failed to get API token for email service:', error);
  }
  return request;
});

// Export the configured client instance
export { client as emailClient };

// Re-export all TanStack Query options for reactive queries
export {
  addRemoveLabelMutation,
  archiveThreadMutation,
  // Mutation options (for writes)
  cancelBackfillGmailMutation,
  createDraftMutation,
  createLabelMutation,
  deleteDraftMutation,
  deleteLabelMutation,
  disableSyncMutation,
  enableSyncMutation,
  // Query options (for reads)
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
  // Query key type
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
// (In the old Orval schema, this was a separate exported type)
export type MessageToSendDbId = string | null;

/**
 * NOTE: The OpenAPI spec incorrectly defines some endpoints as returning arrays
 * when they should return single objects. These helper functions unwrap the response.
 * This should be fixed in the backend OpenAPI spec.
 */
import type {
  GetAttachmentResponse,
  GetThreadResponse,
  ListContactsResponse,
  ListLinksResponse,
} from './generated/types.gen';

// Helper to unwrap array responses from SDK calls
// Usage: const data = unwrapResponse(await getThread({...}))
export function unwrapResponse<T>(response: { data?: T[]; error?: unknown }): {
  data: T | undefined;
  error: unknown;
} {
  return {
    data: response.data?.[0],
    error: response.error,
  };
}

// Corrected type exports for consumers that need single objects
export type ThreadResponse = GetThreadResponse;
export type AttachmentResponse = GetAttachmentResponse;
export type LinksResponse = ListLinksResponse;
export type ContactsResponse = ListContactsResponse;
