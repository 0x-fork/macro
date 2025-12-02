import { logger } from '@observability';
import { threadSeen } from '@queries';

export async function markThreadAsSeen(threadId: string) {
  const { error } = await threadSeen({
    path: { id: threadId },
  });
  if (error) {
    logger.error('Failed to mark email thread as seen', error);
  }
}
