import { logger } from '@observability/logger';
import {
  createDraft,
  deleteDraft,
  type MessageToSend,
  type MessageToSendDbId,
} from '@queries';

export async function saveEmailDraft(
  draft: MessageToSend,
  signal?: AbortSignal
): Promise<MessageToSendDbId | false> {
  const { data, error } = await createDraft({ body: { draft }, signal });
  if (error) {
    if (!signal?.aborted) {
      logger.error(new Error('Failed to save draft', { cause: error }));
    }
    return false;
  }
  if (!data.draft.db_id) {
    logger.error(new Error('Draft save success but no draft id returned'));
    return false;
  }
  return data.draft.db_id;
}

export async function deleteEmailDraft(
  draftId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const { error } = await deleteDraft({ path: { id: draftId }, signal });
  if (error) {
    if (!signal?.aborted) {
      logger.error(new Error('Failed to delete draft', { cause: error }));
    }
    return false;
  }
  return true;
}
