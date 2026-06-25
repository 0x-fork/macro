import { useChatContext } from '@core/component/AI/context';
import type { ChatMessageWithAttachments } from '@core/component/AI/types';
import { asChatMessage } from '@core/component/AI/util/message';
import { StaticMarkdownContext } from '@core/component/LexicalMarkdown/component/core/StaticMarkdown';
import { aiChatTheme } from '@core/component/LexicalMarkdown/theme';
import { isMobile } from '@core/mobile/isMobile';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import { isMobileWidth } from '@core/mobile/mobileWidth';
import { PulsingStar } from '@entity/components/PulsingStar';
import { createElementSize } from '@solid-primitives/resize-observer';
import type { Accessor, JSXElement } from 'solid-js';
import {
  createEffect,
  createMemo,
  createSelector,
  createSignal,
  For,
  Match,
  onMount,
  Show,
  Switch,
} from 'solid-js';
import { createStore } from 'solid-js/store';
import { idStream, timeStream } from '../../util/stream/extendedStream';
import { AssistantMessage } from './AssistantMessage';
import { createMobileKeyboardScrollPin } from './create-mobile-keyboard-scroll-pin';
import { EmptyChatState } from './EmptyChatState';
import { UserMessage } from './UserMessage';

type MessageActions = {};

function OnMount(props: {
  onShow: (ref: HTMLDivElement) => void;
  children: JSXElement;
}) {
  let ref: HTMLDivElement | undefined;
  onMount(() => {
    if (ref) props.onShow(ref);
  });
  return <div ref={ref}>{props.children}</div>;
}

type ChatMessagesProps = {
  messageActions?: MessageActions;
  editDisabled?: boolean;
  pendingLocationParams?: Accessor<Record<string, string> | undefined>;
};

function messageContentIsEmpty(message: ChatMessageWithAttachments) {
  if (typeof message.content === 'string' || Array.isArray(message.content)) {
    return message.content.length === 0;
  } else {
    return false;
  }
}

export function ChatMessages(props: ChatMessagesProps) {
  const chat = useChatContext();
  // Render from the EFFECTIVE chain: persisted `messages` with the in-flight
  // streaming message merged in by id. The streaming message is an in-place
  // entry in this list (a brand-new turn appends at the end; a resume merges
  // into the message it continues, keeping its slot), so there is no separate
  // trailing "generating" bubble — which is what previously pulled a resumed
  // message out of order.
  const messages = chat.effectiveMessages;
  const stream = chat.stream;

  const timedStream = createMemo(() => {
    const s = stream();
    if (!s) return;
    return timeStream(idStream(s));
  });

  const [messageTimingMap, setTiming] = createStore<Record<string, number>>({});

  createEffect(() => {
    const s = timedStream();
    if (!s) return;
    const ttft = s.timeToFirstMessageMs();
    const id = s.messageId();
    if (id && ttft) {
      setTiming(id, ttft);
    }
  });

  let messagesRef: HTMLDivElement | undefined;

  const isStream = () => {
    const s = stream();
    if (!s) return false;
    return !s.isDone();
  };

  // The id of the message currently being streamed (if any), so we can flag it
  // `isStreaming` in the list. While the stream has produced no renderable
  // content yet the spinner (PulsingStar) covers the gap.
  const streamingMessageId = () => {
    const s = stream();
    if (!s || s.isDone()) return undefined;
    const message = asChatMessage(s.data());
    if (!message || messageContentIsEmpty(message)) return undefined;
    return message.id;
  };
  const isStreamingMessage = createSelector(streamingMessageId);

  const [parentHeight, setParentHeight] = createSignal(0);

  const selectScroll = () => {
    return messagesRef?.closest('[data-chat-scroll]');
  };

  const scrollRef = createElementSize(selectScroll);

  const isNearBottom = () => {
    const scrollRef = selectScroll();
    if (!scrollRef) return false;
    const threshold = 100; // pixels from bottom
    return (
      scrollRef.scrollTop + scrollRef.clientHeight >=
      scrollRef.scrollHeight - threshold
    );
  };

  const scrollToBottom = (behavior: 'instant' | 'smooth') => {
    const scrollRef = selectScroll();
    if (!scrollRef) {
      console.warn('Expected parent with data-chat-scroll attribute');
    } else {
      requestAnimationFrame(() =>
        scrollRef.scrollTo({
          behavior,
          top: scrollRef.scrollHeight - scrollRef.clientHeight,
        })
      );
    }
  };

  createEffect(() => {
    const size = scrollRef.height;
    if (!size) return;
    setParentHeight(size);
  });

  // Full-frame mobile: keep pinned to the bottom across virtual-keyboard
  // show/hide when the user was already at the bottom.
  createMobileKeyboardScrollPin({
    scrollEl: selectScroll,
    wrapperEl: () => messagesRef?.parentElement,
    scrollToBottom,
  });

  onMount(() => {
    scrollToBottom('instant');
  });

  // the highlight message id when arriving from search
  const [activeTargetMessageId, setActiveTargetMessageId] = createSignal<
    string | undefined
  >(undefined);

  createEffect(() => {
    const params = props.pendingLocationParams?.();
    if (!params) return;

    if (params.message_id) {
      setActiveTargetMessageId(params.message_id);
      setTimeout(() => {
        const messageElement = document.getElementById(
          `chat-${params.message_id}`
        );
        if (messageElement) {
          const scrollContainer = messageElement.closest(
            '[data-chat-scroll]'
          ) as HTMLElement;
          if (scrollContainer) {
            messageElement.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          }
        }
      }, 0);

      setTimeout(() => {
        setActiveTargetMessageId(undefined);
      }, 1500);
    }
  });

  // The streaming assistant message is now an in-place entry in `messages()`
  // (the effective chain), so the trailing block is the last *pair*
  // (user + assistant) in every case except while merely waiting for the
  // stream to start — then only the just-sent user message exists yet.
  const lastPair = () => {
    const msgs = messages();
    if (chat.isWaiting()) {
      return msgs.slice(-1);
    } else if (msgs.length >= 2) {
      return msgs.slice(-2);
    } else {
      return msgs.slice(-1);
    }
  };

  const allButLastMessagePair = () => {
    const msgs = messages();
    if (chat.isWaiting()) {
      return msgs.slice(0, -1);
    } else if (msgs.length >= 2) {
      return msgs.slice(0, -2);
    } else {
      return msgs.slice(0, -1);
    }
  };

  const activeIdSelector = createSelector(activeTargetMessageId);
  const isEmptyChat = () =>
    messages().length === 0 &&
    !isMobileWidth() &&
    !isTouchDevice() &&
    !isStream() &&
    !chat.isWaiting();

  return (
    <StaticMarkdownContext theme={aiChatTheme}>
      <div
        class="relative flex flex-col w-full px-2 pt-2 gap-y-6 text-sm"
        ref={messagesRef}
      >
        <Show
          when={isEmptyChat()}
          fallback={
            <>
              <For each={allButLastMessagePair()}>
                {(msg) => (
                  <div
                    id={'chat-' + msg.id}
                    class="w-full transition-colors duration-300 flex flex-col gap-y-4"
                    classList={{
                      'bg-accent': activeIdSelector(msg.id),
                    }}
                  >
                    <Switch>
                      <Match when={msg.role === 'user'}>
                        <UserMessage message={msg} />
                      </Match>
                      <Match when={msg.role === 'assistant'}>
                        <AssistantMessage
                          message={msg}
                          ttft={messageTimingMap[msg.id]}
                          isStreaming={isStreamingMessage(msg.id)}
                        />
                      </Match>
                    </Switch>
                  </div>
                )}
              </For>

              <Show when={isStream() || chat.isWaiting() || lastPair()}>
                <div
                  class="shrink-0 flex flex-col gap-y-4"
                  style={{
                    // Sized so scrollToBottom rests the just-sent message at
                    // the top of the viewport. Full-frame mobile keeps the
                    // chrome insets inside the scroller (see Chat.tsx), so
                    // subtract them — the trailing bottom inset otherwise
                    // pushes the message above the viewport, and the message
                    // should rest below the floating top chrome, not under
                    // it. (0.5rem matches the scroll content's top gap.)
                    'min-height': isMobile()
                      ? `calc(${parentHeight()}px - var(--mobile-content-inset-top, 0px) - var(--mobile-content-inset-bottom, 0px) - 0.5rem)`
                      : `${parentHeight()}px`,
                  }}
                >
                  <Show when={lastPair()}>
                    {(pair) => (
                      <For each={pair()}>
                        {(msg) => (
                          <div
                            id={'chat-' + msg.id}
                            class="w-full transition-colors duration-300"
                            classList={{
                              'bg-accent': activeIdSelector(msg.id),
                            }}
                          >
                            <Switch>
                              <Match when={msg.role === 'user'}>
                                <UserMessage message={msg} />
                              </Match>
                              <Match when={msg.role === 'assistant'}>
                                <AssistantMessage
                                  message={msg}
                                  ttft={messageTimingMap[msg.id]}
                                  isStreaming={isStreamingMessage(msg.id)}
                                />
                              </Match>
                            </Switch>
                          </div>
                        )}
                      </For>
                    )}
                  </Show>
                  <Show when={isStream() || chat.isWaiting()}>
                    <OnMount
                      onShow={() =>
                        scrollToBottom(isNearBottom() ? 'instant' : 'smooth')
                      }
                    >
                      <PulsingStar kind="streamIndicator" animate />
                    </OnMount>
                  </Show>
                </div>
              </Show>
            </>
          }
        >
          <EmptyChatState minHeight={Math.max(parentHeight(), 420)} />
        </Show>
      </div>
    </StaticMarkdownContext>
  );
}
