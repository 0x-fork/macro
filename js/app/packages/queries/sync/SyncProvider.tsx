import {
  commsAttachmentPayloadSchema,
  commsMessagePayloadSchema,
  commsReactionPayloadSchema,
  handleCommsAttachment,
  handleCommsMessage,
  handleCommsReaction,
} from '@queries/channel/sync';
import {
  commsTypingPayloadSchema,
  handleCommsTyping,
} from '@queries/channel/typing';
import { invalidateContacts } from '@queries/contacts/contacts';
import {
  applyNotificationStatusUpdate,
  notificationStatusUpdateSchema,
} from '@queries/notification/user-notifications';
// Side-effect import: registers the scheduled-action live-update websocket
// listener. Must be imported somewhere that always loads on app start — this
// provider is guaranteed to mount alongside the other sync handlers.
import '@queries/agent-schedule/sync';
import { createConnectionWebsocketEffect } from '@service-connection/websocket';
import { handleWebsocketPayload } from '@service-connection/websocketPayload';
import type { Accessor, ParentProps } from 'solid-js';
import { match } from 'ts-pattern';

type SyncProviderProps = ParentProps<{
  userId: Accessor<string | undefined>;
}>;

export function QuerySyncProvider(props: SyncProviderProps) {
  createConnectionWebsocketEffect((data) => {
    match(data)
      .with({ type: 'contacts_invalidation' }, () => {
        invalidateContacts();
      })
      .with({ type: 'comms_message' }, () => {
        handleWebsocketPayload(
          data.type,
          data.data,
          commsMessagePayloadSchema,
          handleCommsMessage
        );
      })
      .with({ type: 'comms_reaction' }, () => {
        handleWebsocketPayload(
          data.type,
          data.data,
          commsReactionPayloadSchema,
          handleCommsReaction
        );
      })
      .with({ type: 'comms_attachment' }, () => {
        handleWebsocketPayload(
          data.type,
          data.data,
          commsAttachmentPayloadSchema,
          handleCommsAttachment
        );
      })
      .with({ type: 'comms_typing' }, () => {
        const userId = props.userId();
        if (!userId) return;
        handleWebsocketPayload(
          data.type,
          data.data,
          commsTypingPayloadSchema,
          (payload) => {
            handleCommsTyping(payload, userId);
          }
        );
      })
      .with({ type: 'notification_status_updated' }, () => {
        handleWebsocketPayload(
          data.type,
          data.data,
          notificationStatusUpdateSchema,
          applyNotificationStatusUpdate
        );
      })
      .otherwise(() => {});
  });

  return props.children;
}
