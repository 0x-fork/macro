import { splitProps, type Accessor, type JSX } from 'solid-js';
import { cn } from '@ui/utils/classname';
import { MessageActionsProvider, MessageProvider } from './context';
import type { MessageActions, MessageData } from './types';

type MessageActionsInput =
  | MessageActions
  | Accessor<MessageActions | undefined>;

type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  message: MessageData;
  actions?: MessageActionsInput;
  highlighted?: boolean;
};

export function Root(props: RootProps) {
  const [local, rest] = splitProps(props, [
    'children',
    'class',
    'message',
    'actions',
    'highlighted',
  ]);

  const actionsAccessor: Accessor<MessageActions | undefined> = () => {
    if (typeof local.actions === 'function') {
      return (local.actions as Accessor<MessageActions | undefined>)();
    }
    return local.actions;
  };

  return (
    <div
      class={cn('group/message relative touch:no-select-children', local.class)}
      data-message
      data-message-id={local.message.id}
      data-highlighted={local.highlighted ? '' : undefined}
      {...rest}
    >
      <div class="absolute h-full w-[3px] left-0 top-0 bg-accent opacity-0 message-accent-bar" />
      <MessageProvider value={() => local.message}>
        <MessageActionsProvider value={actionsAccessor}>
          {props.children}
        </MessageActionsProvider>
      </MessageProvider>
    </div>
  );
}
