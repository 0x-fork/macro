import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { createEffectOnEntityTypeNotification } from '@notifications';
import { useQueryClient } from '@queries/client';
import { emailKeys } from '@queries/email/keys';
import { invalidateEntityNotifications } from '@queries/notification/user-notifications';
import {
  invalidateSoupEntity,
  refetchSoupEntity,
} from '@queries/soup/normalized-cache';

/** Keeps normalized Soup entities current as entity notifications arrive. */
export function useSoupNotificationInvalidators() {
  const notificationSource = useGlobalNotificationSource();
  const queryClient = useQueryClient();

  createEffectOnEntityTypeNotification(
    notificationSource,
    'channel',
    (notification) => {
      const metadata = notification.notification_metadata;
      const threadId =
        metadata.tag === 'channel_mention' ||
        metadata.tag === 'channel_message_reply'
          ? metadata.content.threadId?.toString()
          : undefined;

      refetchSoupEntity(notification.entity_id, 'channel');
      invalidateSoupEntity(notification.entity_id);
      invalidateEntityNotifications(notification.entity_id);

      if (threadId) {
        refetchSoupEntity(threadId, 'channelThread');
        invalidateSoupEntity(threadId);
        invalidateEntityNotifications(threadId);
      }
    }
  );

  for (const type of ['chat', 'foreign_entity'] as const) {
    createEffectOnEntityTypeNotification(
      notificationSource,
      type,
      (notification) => {
        refetchSoupEntity(
          notification.entity_id,
          type === 'chat' ? 'chat' : 'foreignEntity'
        );
        invalidateSoupEntity(notification.entity_id);
        invalidateEntityNotifications(notification.entity_id);
      }
    );
  }

  createEffectOnEntityTypeNotification(
    notificationSource,
    'email_thread',
    (notification) => {
      refetchSoupEntity(notification.entity_id, 'emailThread');
      invalidateSoupEntity(notification.entity_id);
      queryClient.invalidateQueries({
        queryKey: emailKeys.threadMessages(notification.entity_id).queryKey,
      });
    }
  );

  createEffectOnEntityTypeNotification(
    notificationSource,
    'document',
    (notification) => {
      if (notification.notification_event_type !== 'task_assigned') return;
      refetchSoupEntity(notification.entity_id, 'document');
      invalidateSoupEntity(notification.entity_id);
      invalidateEntityNotifications(notification.entity_id);
    }
  );
}
