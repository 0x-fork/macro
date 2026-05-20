import { SplitDrawer } from '@app/component/split-layout/components/SplitDrawer';
import clickOutside from '@core/directive/clickOutside';
import type { Entity } from '@core/types';
import {
  type NotificationSource,
  useNotificationsForEntity,
} from '@notifications';
import { createMemo, Suspense } from 'solid-js';
import { Notifications } from './Notifications';

false && clickOutside;
const NOTIFICATIONS_DRAWER_ID = 'notifications';

export function NotificationsDrawer(props: {
  entity: Entity;
  notificationSource: NotificationSource;
}) {
  const notifications = useNotificationsForEntity(
    props.notificationSource,
    props.entity
  );
  const unreadCount = createMemo(
    () => notifications().filter((n) => !n.viewed_at).length
  );
  const title = () => (
    <>
      Notifications
      <span class="text-ink-extra-muted">
        {unreadCount() > 0 ? ` - ${unreadCount()} unread` : ''}
      </span>
    </>
  );
  return (
    <SplitDrawer
      id={NOTIFICATIONS_DRAWER_ID}
      side="right"
      size={768}
      title={title()}
    >
      <Suspense
        fallback={
          <div class="flex justify-center py-8">
            <div class="animate-spin rounded-full size-6 border-b-2 border-ink-muted"></div>
          </div>
        }
      >
        <Notifications
          entity={props.entity}
          notificationSource={props.notificationSource}
        />
      </Suspense>
    </SplitDrawer>
  );
}
