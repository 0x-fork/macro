import { Show, createMemo } from 'solid-js';
import type { EntityData } from '../types/entity';
import { isWithNotification } from '../types/notification';
import {
  filterNotDoneNotifications,
  filterValidNotifications,
} from '../utils/notification';
import { useNotificationsForEntity } from '@notifications';
import { useGlobalNotificationSource } from '@app/component/GlobalAppState';

interface NotificationCountProps {
  entity: EntityData;
}

/**
 * Displays the count of not-done notifications for an entity
 * Returns empty fragment if entity has no notifications or all are done
 */
export function NotificationCount(props: NotificationCountProps) {
  const notificationsSource = useGlobalNotificationSource();
  const entityNotifications = useNotificationsForEntity(
    notificationsSource,
    props.entity
  );
  const count = createMemo(() => {
    if (!isWithNotification(props.entity)) return 0;

    const notifications = entityNotifications();
    if (!notifications) return 0;

    const validNotifications = filterValidNotifications(notifications);
    const notDoneNotifications = filterNotDoneNotifications(validNotifications);

    return notDoneNotifications.length;
  });

  return <Show when={count() > 0}>{count()}</Show>;
}
