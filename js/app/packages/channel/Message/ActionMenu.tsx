import ReplyIcon from '@icon/regular/arrow-bend-up-left.svg';
import LinkIcon from '@icon/regular/link.svg';
import PencilIcon from '@icon/regular/pencil.svg';
import PlusIcon from '@icon/regular/plus.svg';
import SpinnerIcon from '@icon/regular/spinner.svg';
import TrashIcon from '@icon/regular/trash.svg';
import StatusCreatedIcon from '@macro-icons/square/task-created.svg';
import { cn } from '@ui/utils/classname';
import { createSignal, For, Show, type Component, type JSX } from 'solid-js';
import { EmojiReactionPopover } from './EmojiReactionPopover';
import { HoverActions } from './HoverActions';
import { useMessage, useMessageActions, useMessageSelection } from './context';
import { renderIcon } from './render-icon';
import type { MessageActionEvent, MessageActionHandler } from './types';

const QUICK_REACTION_EMOJIS = ['❤️', '👍', '😂'] as const;

type ActionId = 'reply' | 'copy-link' | 'create-ai-task' | 'edit' | 'delete';

type ActionItem = {
  id: ActionId;
  label: string;
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>> | string;
  onClick?: MessageActionHandler;
  disabled?: boolean;
  destructive?: boolean;
};

type ActionMenuProps = {
  class?: string;
};

function ActionButton(props: {
  action: ActionItem;
  onClick: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
}) {
  return (
    <button
      type="button"
      title={props.action.label}
      aria-label={props.action.label}
      data-message-action={props.action.id}
      disabled={props.action.disabled}
      class={cn(
        'size-8 flex items-center justify-center text-ink-muted hover:bg-hover hover-transition-bg disabled:hover:bg-transparent',
        {
          'text-failure-ink': props.action.destructive,
          'opacity-50 cursor-not-allowed': props.action.disabled,
        }
      )}
      onClick={props.onClick}
    >
      {renderIcon(
        props.action.icon,
        props.action.id === 'create-ai-task' && props.action.disabled
          ? 'animate-spin'
          : undefined
      )}
    </button>
  );
}

export function ActionMenu(props: ActionMenuProps) {
  const message = useMessage();
  const actions = useMessageActions();
  const selection = useMessageSelection();
  const [emojiMenuOpen, setEmojiMenuOpen] = createSignal(false);

  const handleReaction = (emoji: string, event?: MessageActionEvent) => {
    void actions?.()?.onReact?.({
      message: message(),
      event,
      emoji,
    });
  };

  const hasReactAction = () => actions?.()?.onReact !== undefined;

  const actionItems = (): ActionItem[] => [
    {
      id: 'reply',
      label: 'Reply',
      icon: ReplyIcon,
      onClick: actions?.()?.onReply,
    },
    {
      id: 'copy-link',
      label: 'Copy Link',
      icon: LinkIcon,
      onClick: actions?.()?.onCopyLink,
    },
    {
      id: 'create-ai-task',
      label: 'Create AI Task',
      icon: actions?.()?.createAiTaskPending ? SpinnerIcon : StatusCreatedIcon,
      onClick: actions?.()?.onCreateAiTask,
      disabled: actions?.()?.createAiTaskPending,
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: PencilIcon,
      onClick: actions?.()?.onEdit,
    },
    {
      id: 'delete',
      label: 'Delete',
      icon: TrashIcon,
      onClick: actions?.()?.onDelete,
      destructive: true,
    },
  ];

  const visibleActions = () => actionItems().filter((item) => item.onClick);

  return (
    <Show when={hasReactAction() || visibleActions().length > 0}>
      <HoverActions
        class={props.class}
        persistentVisible={emojiMenuOpen() || !!selection?.isSelected}
      >
        <div class="flex flex-row bg-menu border border-edge-muted items-center allow-css-brackets">
          <Show when={hasReactAction()}>
            <For each={QUICK_REACTION_EMOJIS}>
              {(emoji) => (
                <button
                  type="button"
                  title={`React ${emoji}`}
                  aria-label={`React ${emoji}`}
                  data-message-action="react-quick"
                  data-emoji={emoji}
                  class="size-8 flex items-center justify-center hover:bg-hover hover-transition-bg text-lg/none"
                  onClick={(event) => {
                    handleReaction(emoji, event);
                  }}
                >
                  {emoji}
                </button>
              )}
            </For>

            <EmojiReactionPopover
              placement="left"
              open={emojiMenuOpen()}
              onOpenChange={setEmojiMenuOpen}
              onEmojiSelect={(emoji) => {
                handleReaction(emoji);
              }}
              trigger={renderIcon(PlusIcon)}
              triggerProps={{
                title: 'More reactions',
                'aria-label': 'More reactions',
                'data-message-action': 'react-open-menu',
                class:
                  'size-8 flex items-center justify-center text-ink-muted hover:bg-hover hover-transition-bg',
              }}
            />
          </Show>

          <For each={visibleActions()}>
            {(action) => (
              <ActionButton
                action={action}
                onClick={async (event) => {
                  if (!action.onClick || action.disabled) return;
                  await action.onClick({ message: message(), event });
                }}
              />
            )}
          </For>
        </div>
      </HoverActions>
    </Show>
  );
}
