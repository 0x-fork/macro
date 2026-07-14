import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import { toast } from '@core/component/Toast/Toast';
import type { EntityType } from '@core/types';
import type { NotificationSource } from '@notifications';
import { createSignal } from 'solid-js';

type MakeNotificationToggleActionOptions = {
  entityType: Extract<EntityType, 'channel' | 'channel_thread'>;
  targetLabel: 'channel' | 'thread';
  notificationSource?: NotificationSource;
};

export type NotificationToggleAction = {
  isEnabled: (id: string) => boolean;
  isLoading: () => boolean;
  isPending: (id: string) => boolean;
  execute: (id: string, enabled?: boolean) => Promise<boolean>;
};

export function makeNotificationToggleAction(
  options: MakeNotificationToggleActionOptions
): NotificationToggleAction {
  const notificationSource =
    options.notificationSource ?? useGlobalNotificationSource();
  const [pendingIds, setPendingIds] = createSignal<ReadonlySet<string>>(
    new Set()
  );

  const isLoading = () => notificationSource.isLoading();
  const isPending = (id: string) => pendingIds().has(id);

  const isEnabled = (id: string) =>
    !notificationSource
      .mutedEntities()
      .some(
        (item) => item.item_type === options.entityType && item.item_id === id
      );

  const setPending = (id: string, pending: boolean) => {
    setPendingIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const execute = async (id: string, enabled = !isEnabled(id)) => {
    if (!id || isLoading() || isPending(id)) return false;
    if (enabled === isEnabled(id)) return true;

    setPending(id, true);
    const entity = { id, type: options.entityType } as const;

    try {
      if (enabled) await notificationSource.unmuteEntity(entity);
      else await notificationSource.muteEntity(entity);

      toast.success(
        `${options.targetLabel === 'channel' ? 'Channel' : 'Thread'} notifications ${enabled ? 'enabled' : 'disabled'}`
      );
      return true;
    } catch {
      toast.failure(
        `Failed to ${enabled ? 'enable' : 'disable'} ${options.targetLabel} notifications`
      );
      return false;
    } finally {
      setPending(id, false);
    }
  };

  return { isEnabled, isLoading, isPending, execute };
}
