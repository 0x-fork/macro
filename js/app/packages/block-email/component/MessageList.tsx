import { useEmailContext } from '@block-email/component/EmailContext';
import { isScrollingToMessage } from '@block-email/signal/scrollState';
import { CircleSpinner } from '@core/component/CircleSpinner';
import { createMemo, createSelector, createSignal, For, Show } from 'solid-js';
import { createStore } from 'solid-js/store';
import { MessageContainer } from './MessageContainer';

interface MessageListProps {
  initialLoadComplete: boolean;
}

export function MessageList(props: MessageListProps) {
  const getIsScrollingToMessage = isScrollingToMessage.get;
  const context = useEmailContext();

  const [expandedMessageBodyIds, setExpandedMessageBodyIds] = createStore<
    Record<string, boolean>
  >({});

  const isFocusedSelector = createSelector(
    context.messages.focusedID,
    (a, b) => !!a && !!b && a === b
  );
  const isTargetSelector = createSelector(
    context.messages.targetMessageID,
    (a, b) => a === b
  );

  return (
    <div
      class="pt-3 w-full flex flex-col-reverse items-center overflow-y-scroll overflow-x-hidden suppress-css-brackets"
      ref={context.registerMessagesList}
      onscroll={(e) => {
        // Don't load more if we're programmatically scrolling to a message
        if (getIsScrollingToMessage() || !props.initialLoadComplete) return;

        const threshold = 300;

        // Since the list is reversed, the scrollTop is negative. So we get the scroll position
        // from the bottom up using the scrollHeight and clientHeight
        const currentScrollPosition =
          e.currentTarget.scrollHeight +
          e.currentTarget.scrollTop -
          e.currentTarget.clientHeight;

        const isNearBeginning = currentScrollPosition <= threshold;

        if (
          isNearBeginning &&
          !context.query.isFetching() &&
          context.query.hasMore()
        ) {
          context.query.fetchNextPage();
        }
      }}
    >
      <For each={context.messages.list().toReversed()}>
        {(message, index) => {
          const [containerRef, setContainerRef] = createSignal<HTMLElement>();

          // We need the index as if the list was not reversed
          const normalizedIndex = createMemo(() => {
            const listLength = context.messages.list().length;

            const normalized = listLength - 1 - index();

            // The element at the 0th index isn't actually the first message
            // if there is more data to load so we return -1 so that `isFirstMessage`
            // evaluates to false. This fixes an issue with the "first" message' full
            // html to show in `EmailMessageBody`
            if (normalized === 0 && context.query.hasMore()) {
              return -1;
            }

            return normalized;
          });

          const isLastMessage = createMemo(() => {
            return (
              normalizedIndex() === (context.messages.list().length ?? 0) - 1
            );
          });

          const isNewMessage = createMemo(() => {
            return (
              message.labels.find((l) => l.provider_label_id === 'UNREAD') !==
              undefined
            );
          });

          const isExpanded = createMemo(() => {
            const manuallyExpanded =
              message.db_id != null &&
              expandedMessageBodyIds[message.db_id] === true;

            return manuallyExpanded || isLastMessage() || isNewMessage();
          });

          const onToggleMessage = (expanded: boolean) => {
            if (!message.db_id) return;

            setExpandedMessageBodyIds(message.db_id, expanded);

            queueMicrotask(() => {
              const top = containerRef()?.getBoundingClientRect().top;
              if (!top) return;

              // We only need to scroll the element into view if:
              // - the top of it is out of view. In which case the `top`
              //   would be negative
              // - OR we're collapsing it to maintain scroll position
              //
              // Otherwise, if the element is in view and we're expanding it,
              // we do not do anything
              if (top > 0 && expanded) {
                return;
              }

              containerRef()?.scrollIntoView();
            });
          };

          return (
            <MessageContainer
              ref={setContainerRef}
              message={message}
              isFirstMessage={normalizedIndex() === 0}
              isLastMessage={isLastMessage()}
              isFocused={isFocusedSelector(message.db_id ?? undefined)}
              isTarget={isTargetSelector(message.db_id ?? undefined)}
              isNewMessage={isNewMessage()}
              isExpanded={isExpanded()}
              onToggleExpandedState={onToggleMessage}
            />
          );
        }}
      </For>

      <Show when={context.query.isFetching()}>
        <div class="flex items-center justify-center h-16">
          <CircleSpinner />
        </div>
      </Show>
    </div>
  );
}
