import type { NotificationSource } from '@notifications';
import { makeNotificationToggleAction } from './make-notification-toggle-action';

type MakeChannelThreadNotificationsActionOptions = {
  notificationSource?: NotificationSource;
};

/** Creates an action that enables or disables notifications for a channel thread. */
export const makeChannelThreadNotificationsAction = (
  options: MakeChannelThreadNotificationsActionOptions = {}
) =>
  makeNotificationToggleAction({
    entityType: 'channel_thread',
    targetLabel: 'thread',
    notificationSource: options.notificationSource,
  });
