import { MenuItem } from '@core/component/ContextMenu';
import { Dropdown } from '@ui';
import type { JSX } from 'solid-js';
import { makeChannelNotificationsAction } from './make-channel-notifications-action';
import { makeChannelThreadNotificationsAction } from './make-channel-thread-notifications-action';
import type { NotificationToggleAction } from './make-notification-toggle-action';

type BaseNotificationMenuItemProps = {
  label?: JSX.Element;
  disabled?: boolean;
  class?: string;
};

export type ChannelNotificationsMenuItemProps =
  BaseNotificationMenuItemProps & {
    channelId: string;
  };

export type ChannelThreadNotificationsMenuItemProps =
  BaseNotificationMenuItemProps & {
    threadId: string;
  };

type NotificationDropdownMenuItemProps = BaseNotificationMenuItemProps & {
  id: string;
  action: NotificationToggleAction;
  defaultLabel: string;
};

function NotificationDropdownMenuItem(
  props: NotificationDropdownMenuItemProps
) {
  return (
    <Dropdown.CheckboxItem
      checked={props.action.isEnabled(props.id)}
      disabled={
        props.disabled ||
        props.action.isLoading() ||
        props.action.isPending(props.id)
      }
      class={props.class}
      onChange={(enabled) => void props.action.execute(props.id, enabled)}
    >
      {props.label ?? props.defaultLabel}
    </Dropdown.CheckboxItem>
  );
}

type NotificationContextMenuItemProps = NotificationDropdownMenuItemProps;

function NotificationContextMenuItem(props: NotificationContextMenuItemProps) {
  return (
    <MenuItem
      selectorType="checkbox"
      checked={props.action.isEnabled(props.id)}
      disabled={
        props.disabled ||
        props.action.isLoading() ||
        props.action.isPending(props.id)
      }
      class={props.class}
      onChange={(enabled) => void props.action.execute(props.id, enabled)}
      text={props.label ?? props.defaultLabel}
    />
  );
}

/** Checkbox item for composing channel notification controls into a dropdown. */
export function ChannelNotificationsDropdownMenuItem(
  props: ChannelNotificationsMenuItemProps
) {
  const action = makeChannelNotificationsAction();
  return (
    <NotificationDropdownMenuItem
      id={props.channelId}
      action={action}
      defaultLabel="Channel notifications"
      label={props.label}
      disabled={props.disabled}
      class={props.class}
    />
  );
}

/** Checkbox item for composing channel notification controls into a context menu. */
export function ChannelNotificationsContextMenuItem(
  props: ChannelNotificationsMenuItemProps
) {
  const action = makeChannelNotificationsAction();
  return (
    <NotificationContextMenuItem
      id={props.channelId}
      action={action}
      defaultLabel="Channel notifications"
      label={props.label}
      disabled={props.disabled}
      class={props.class}
    />
  );
}

/** Checkbox item for composing thread notification controls into a dropdown. */
export function ChannelThreadNotificationsDropdownMenuItem(
  props: ChannelThreadNotificationsMenuItemProps
) {
  const action = makeChannelThreadNotificationsAction();
  return (
    <NotificationDropdownMenuItem
      id={props.threadId}
      action={action}
      defaultLabel="Thread notifications"
      label={props.label}
      disabled={props.disabled}
      class={props.class}
    />
  );
}

/** Checkbox item for composing thread notification controls into a context menu. */
export function ChannelThreadNotificationsContextMenuItem(
  props: ChannelThreadNotificationsMenuItemProps
) {
  const action = makeChannelThreadNotificationsAction();
  return (
    <NotificationContextMenuItem
      id={props.threadId}
      action={action}
      defaultLabel="Thread notifications"
      label={props.label}
      disabled={props.disabled}
      class={props.class}
    />
  );
}
