import { cn } from '@ui';
import { type JSX, splitProps } from 'solid-js';
import { MessageActionsProvider, MessageProvider } from './context';
import { consumeMessageEntrance } from './entrance-animation';
import type { MessageActions, MessageData } from './types';

type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  message: MessageData;
  actions?: MessageActions;
  highlighted?: boolean;
  selected?: boolean;
};

export function Root(props: RootProps) {
  const [local, rest] = splitProps(props, [
    'children',
    'class',
    'message',
    'actions',
    'highlighted',
    'selected',
  ]);

  // Consumed once at mount: true only for the row created by the local
  // user's own send (see entrance-animation.ts).
  const animateSendIn = consumeMessageEntrance(props.message.id);

  return (
    <div
      class={cn(
        'group/message relative touch:no-select-children',
        animateSendIn &&
          'message-send-in-animation [--message-send-in-origin:bottom_left]',
        local.class
      )}
      data-message
      data-message-id={local.message.id}
      data-highlighted={local.highlighted ? '' : undefined}
      data-selected={local.selected ? '' : undefined}
      {...rest}
    >
      <div class="absolute h-full w-1 left-0 top-0 bg-accent opacity-0 message-accent-bar" />
      <MessageProvider value={() => local.message}>
        <MessageActionsProvider value={local.actions}>
          {props.children}
        </MessageActionsProvider>
      </MessageProvider>
    </div>
  );
}
