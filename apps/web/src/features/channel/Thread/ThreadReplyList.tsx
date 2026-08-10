import type { IUser } from '@core/user/types';
import { MarkMessageNotifications } from '@notifications/components/MarkMessageNotifications';
import type { ApiThreadReply } from '@service-storage/generated/schemas/apiThreadReply';
import { cn } from '@ui';
import {
  type Accessor,
  createMemo,
  For,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import type { MessageEditor } from '../Channel/create-message-editor';
import type { NewMessageCheckable } from '../Channel/util';
import {
  ChannelMessage,
  type MessageActions,
  type MessageData,
} from '../Message';
import { createTargetReplyScroller } from './create-target-reply-scroller';
import { buildThreadReplyListMeta } from './reply-list-meta';

export type ThreadReplyListHandle = {
  scrollToIndex: (index: number, onSettled: () => void) => boolean;
  cancelScroll: () => void;
};

export function ThreadReplyList(props: {
  channelId: string;
  threadId: string;
  replies: Array<ApiThreadReply>;
  getMessageActions?: (message: MessageData) => MessageActions | undefined;
  messageEditor?: MessageEditor;
  participants?: Accessor<IUser[]>;
  isNewMessage?: (message: NewMessageCheckable) => boolean;
  onReady?: (handle: ThreadReplyListHandle) => void;
  positionTarget?: (
    threadRow: HTMLElement,
    targetReply: HTMLElement
  ) => boolean;
  selectedReplyId?: Accessor<string | undefined>;
  /**
   * Reply targeted by channel navigation or bound to the unified input's reply (quote-reply).
   */
  targetedReplyId?: Accessor<string | undefined>;
  isThreadFocused?: Accessor<boolean>;
  onSelectReply?: (replyId: string) => void;
}) {
  const listMetaByReplyId = createMemo(() =>
    buildThreadReplyListMeta(props.replies, props.isNewMessage)
  );
  const replyElements: Array<HTMLElement | undefined> = [];
  const targetReplyScroller = createTargetReplyScroller({
    getTarget: (index) => replyElements[index],
    positionTarget: props.positionTarget,
  });

  onMount(() => {
    props.onReady?.({
      scrollToIndex: targetReplyScroller.scrollToIndex,
      cancelScroll: targetReplyScroller.cancel,
    });
  });

  onCleanup(targetReplyScroller.dispose);

  return (
    <For each={props.replies}>
      {(reply, index) => {
        const replyMessage = () => ({
          ...reply,
          thread_id: props.threadId,
        });

        const isReplySelected = () =>
          !!props.isThreadFocused?.() && props.selectedReplyId?.() === reply.id;

        return (
          <div
            ref={(element) => {
              replyElements[index()] = element;
            }}
            class="relative"
          >
            {/* This row's stretch of the rail spine. Contiguous rows form a
                continuous line; the wrapper's bridge and terminal pieces
                cover the container padding above and below. */}
            <div
              class={cn(
                'pointer-events-none absolute inset-y-0 -z-1 border-l border-rail',
                listMetaByReplyId()[reply.id].isNewMessage && 'border-accent'
              )}
              style={{
                left: 'calc(var(--user-icon-width) / 2 + var(--message-padding-x) - var(--thread-shift))',
              }}
            />
            {/* Branch off the rail spine, curving under this reply's avatar.
                Grouped replies (no avatar) don't branch — the spine just
                passes them by. */}
            <Show when={!listMetaByReplyId()[reply.id].isGroupedWithPrevious}>
              <div
                class={cn(
                  'pointer-events-none absolute top-0 -z-1 border-l border-b border-rail rounded-bl-[14px]',
                  listMetaByReplyId()[reply.id].isNewMessage && 'border-accent'
                )}
                style={{
                  left: 'calc(var(--user-icon-width) / 2 + var(--message-padding-x) - var(--thread-shift))',
                  width:
                    'calc(var(--thread-shift) - var(--user-icon-width) / 2)',
                  height:
                    'calc(var(--regular-message-padding-t) + var(--user-icon-width) / 2)',
                }}
              />
            </Show>
            <MarkMessageNotifications
              messageId={reply.id}
              channelId={props.channelId}
            >
              <ChannelMessage
                channelId={props.channelId}
                message={replyMessage()}
                actions={props.getMessageActions?.(replyMessage())}
                listMeta={listMetaByReplyId()[reply.id]}
                messageEditor={props.messageEditor}
                participants={props.participants}
                onClick={() => props.onSelectReply?.(reply.id)}
                selected={isReplySelected()}
                targeted={props.targetedReplyId?.() === reply.id}
              />
            </MarkMessageNotifications>
          </div>
        );
      }}
    </For>
  );
}
