import type { UnifiedNotification } from '@notifications';
import type { EntityData } from '../types/entity';

export function unreadFilterFn(
  entity: EntityData,
  notifications: UnifiedNotification[]
) {
  if (entity.type === 'email') return !entity.isRead;
  return notifications.some(({ viewed_at }) => !viewed_at) ?? false;
}
