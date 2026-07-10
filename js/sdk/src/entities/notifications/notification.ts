import type { GetTypedNotificationByIdResponses } from '../../../generated/notification/types.gen';
import { paginate, unwrap } from '../../utils';
import type { MacroClient } from '../../utils/client';
import { MacroEntity } from '../entity';

type NotificationDetail = GetTypedNotificationByIdResponses[200];

/**
 * A notification in the viewer's feed.
 */
export class Notification extends MacroEntity<NotificationDetail> {
  protected async fetch(): Promise<NotificationDetail> {
    return unwrap(
      await this.client.notification.getTypedNotificationById({
        path: { notification_id: this.id },
      }),
    );
  }

  /** A handle to a notification by id. Details load on first access. */
  static byId(client: MacroClient, id: string): Notification {
    return new Notification(client, id);
  }

  /** Build a notification from a list-endpoint record (pre-seeded, no fetch). */
  static from(client: MacroClient, data: NotificationDetail): Notification {
    return new Notification(client, data.id, data);
  }

  /** The viewer's notification feed, most recent first, auto-paginated. */
  static list(
    client: MacroClient,
    opts?: { pageSize?: number },
  ): AsyncGenerator<Notification> {
    return paginate(async (cursor) => {
      const page = unwrap(
        await client.notification.listTypedNotifications({
          query: {
            ...(opts?.pageSize ? { limit: opts.pageSize } : {}),
            ...(cursor ? { cursor } : {}),
          },
        }),
      );
      return {
        items: page.items.map((n) => Notification.from(client, n)),
        nextCursor: page.next_cursor,
      };
    });
  }

  /** The notification event type (e.g. `channel_mention`). */
  readonly type = this.field('notification_event_type');

  /** When the notification was created. */
  readonly createdAt = this.field('created_at');

  /** Whether the notification is marked as done. */
  readonly done = this.field('done');

  /** When the notification was viewed, if it has been seen. */
  readonly viewedAt = this.field('viewed_at');

  /** The id of the user who triggered the notification, if any. */
  readonly senderId = this.field('sender_id');

  /** The typed notification payload (tagged by event type). */
  readonly metadata = this.field('notification_metadata');

  /** Whether the notification has been seen (viewed at least once). */
  async seen(): Promise<boolean> {
    return (await this.viewedAt()) !== undefined;
  }

  /** Mark the notification as seen. */
  async markSeen(): Promise<void> {
    await this.mutate((c) =>
      c.notification.bulkMarkNotificationsSeen({
        body: { notificationIds: [this.id] },
      }),
    );
  }

  /** Mark the notification as done. */
  async markDone(): Promise<void> {
    await this.mutate((c) =>
      c.notification.bulkMarkNotificationsDone({
        body: { notificationIds: [this.id] },
      }),
    );
  }

  /** Move the notification back to not-done. */
  async markUndone(): Promise<void> {
    await this.mutate((c) =>
      c.notification.bulkMarkNotificationsUndone({
        body: { notificationIds: [this.id] },
      }),
    );
  }

  /** Delete the notification. */
  async delete(): Promise<void> {
    await this.mutate((c) =>
      c.notification.deleteUserNotificationV2({
        path: { notification_id: this.id },
      }),
    );
  }
}
