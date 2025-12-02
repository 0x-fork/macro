import { logger } from '@observability/logger';
import {
  createDraft,
  deleteDraft,
  type MessageToSend,
  type MessageToSendDbId,
} from '@service-email/client';

export async function saveEmailDraft(
  draft: MessageToSend
): Promise<MessageToSendDbId | false> {
  const { data, error } = await createDraft({ body: { draft } });
  if (error) {
    logger.error(new Error('Failed to save draft', { cause: error }));
    return false;
  }
  if (!data.draft.db_id) {
    logger.error(new Error('Draft save success but no draft id returned'));
    return false;
  }
  return data.draft.db_id;
}

export async function deleteEmailDraft(draftId: string): Promise<boolean> {
  const { error } = await deleteDraft({ path: { id: draftId } });
  if (error) {
    logger.error(new Error('Failed to delete draft', { cause: error }));
    return false;
  }
  return true;
}
