import type { NotificationSource } from '@notifications';
import { makeNotificationToggleAction } from './make-notification-toggle-action';

type MakeChannelNotificationsActionOptions = {
  notificationSource?: NotificationSource;
};

/** Creates an action that enables or disables notifications for a channel. */
export const makeChannelNotificationsAction = (
  options: MakeChannelNotificationsActionOptions = {}
) =>
  makeNotificationToggleAction({
    entityType: 'channel',
    targetLabel: 'channel',
    notificationSource: options.notificationSource,
  });
