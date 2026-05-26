import AddEmojiIcon from '@icon/square-add-emoji.svg';
import EditIcon from '@icon/square-edit.svg';
import LinkIcon from '@icon/square-link.svg';
import ReplyIcon from '@icon/square-reply.svg';
import TrashIcon from '@icon/square-trash.svg';
import StarIcon from '@icon/wide-star.svg';
import TaskIcon from '@icon/wide-task.svg';
import DotsThree from '@phosphor/dots-three.svg';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { Layer } from '@ui';
import { type Component, createSignal, For, type JSX, Show } from 'solid-js';
import { useMessage, useMessageActions } from './context';
import { EmojiReactionPopover } from './EmojiReactionPopover';
import { HoverActions } from './HoverActions';
import { renderIcon } from './render-icon';
import type { MessageActionEvent, MessageActionHandler } from './types';

const QUICK_REACTION_EMOJIS = ['❤️', '👍', '😂'] as const;

type MoreActionItem = {
  id: string;
  label: string;
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>> | string;
  onClick?: MessageActionHandler;
};

type ActionMenuProps = {
  class?: string;
};

export function ActionMenu(props: ActionMenuProps) {
  const message = useMessage();
  const actions = useMessageActions();
  const [emojiMenuOpen, setEmojiMenuOpen] = createSignal(false);
  const [moreMenuOpen, setMoreMenuOpen] = createSignal(false);

  const handleReaction = (emoji: string, event?: MessageActionEvent) => {
    void actions?.onReact?.({
      message: message(),
      event,
      emoji,
    });
  };

  const hasReactAction = () => actions?.onReact !== undefined;
  const hasReplyAction = () => actions?.onReply !== undefined;
  const hasEditAction = () => actions?.onEdit !== undefined;
  const hasDeleteAction = () => actions?.onDelete !== undefined;

  const moreActions: MoreActionItem[] = [
    {
      id: 'create-task',
      label: 'Create task',
      icon: TaskIcon,
      onClick: actions?.onCreateTask,
    },
    {
      id: 'chat',
      label: 'Chat with Agent',
      icon: StarIcon,
      onClick: actions?.onChat,
    },
    {
      id: 'copy-link',
      label: 'Copy link',
      icon: LinkIcon,
      onClick: actions?.onCopyLink,
    },
  ];

  const visibleMoreActions = () => moreActions.filter((item) => item.onClick);

  const hasAnyAction = () =>
    hasReactAction() || hasReplyAction() || hasEditAction() || hasDeleteAction() || visibleMoreActions().length > 0;

  return (
    <Show when={hasAnyAction()}>
      <HoverActions class={props.class} persistentVisible={emojiMenuOpen() || moreMenuOpen()}>
        <Layer depth={3}>
          <div
            class="flex flex-row bg-surface border border-edge-muted shadow-md rounded-md items-center p-1 gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Show when={hasReactAction()}>
              <For each={QUICK_REACTION_EMOJIS}>
                {(emoji) => (
                  <button
                    type="button"
                    title={`React ${emoji}`}
                    aria-label={`React ${emoji}`}
                    data-message-action="react-quick"
                    data-emoji={emoji}
                    class="size-6 flex items-center justify-center hover:bg-ink/10 transition-colors text-sm/none rounded-sm"
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
                trigger={renderIcon(AddEmojiIcon)}
                triggerProps={{
                  title: 'More reactions',
                  'aria-label': 'More reactions',
                  'data-message-action': 'react-open-menu',
                  class:
                    'size-6 flex items-center justify-center text-ink-muted hover:text-ink hover:bg-ink/10 transition-colors rounded-sm',
                }}
              />
              <Show when={hasReplyAction() || hasEditAction() || hasDeleteAction() || visibleMoreActions().length > 0}>
                <div class="w-px self-stretch bg-edge-muted mx-1" />
              </Show>
            </Show>

            <Show when={hasReplyAction()}>
              <button
                type="button"
                title="Reply"
                aria-label="Reply"
                data-message-action="reply"
                class="size-6 flex items-center justify-center transition-colors rounded-sm text-ink-muted hover:text-ink hover:bg-ink/10"
                onClick={(event) => {
                  void actions?.onReply?.({ message: message(), event });
                }}
              >
                <span class="block size-4">
                  {renderIcon(ReplyIcon, 'w-full h-full')}
                </span>
              </button>
            </Show>

            <Show when={hasEditAction()}>
              <button
                type="button"
                title="Edit"
                aria-label="Edit"
                data-message-action="edit"
                class="size-6 flex items-center justify-center transition-colors rounded-sm text-ink-muted hover:text-ink hover:bg-ink/10"
                onClick={(event) => {
                  void actions?.onEdit?.({ message: message(), event });
                }}
              >
                <span class="block size-4">
                  {renderIcon(EditIcon, 'w-full h-full')}
                </span>
              </button>
            </Show>

            <Show when={hasDeleteAction()}>
              <button
                type="button"
                title="Delete"
                aria-label="Delete"
                data-message-action="delete"
                class="size-6 flex items-center justify-center transition-colors rounded-sm text-failure-ink hover:bg-failure/10"
                onClick={(event) => {
                  void actions?.onDelete?.({ message: message(), event });
                }}
              >
                <span class="block size-4">
                  {renderIcon(TrashIcon, 'w-full h-full')}
                </span>
              </button>
            </Show>

            <Show when={visibleMoreActions().length > 0}>
              <DropdownMenu open={moreMenuOpen()} onOpenChange={setMoreMenuOpen}>
                <DropdownMenu.Trigger
                  class="size-6 flex items-center justify-center text-ink-muted hover:text-ink hover:bg-ink/10 transition-colors rounded-sm"
                  title="More actions"
                  aria-label="More actions"
                  data-message-action="more"
                >
                  <span class="block size-4">
                    {renderIcon(DotsThree, 'w-full h-full')}
                  </span>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <Layer depth={3}>
                    <DropdownMenu.Content class="z-50 min-w-40 bg-surface border border-edge-muted rounded-lg shadow-lg p-1">
                      <For each={visibleMoreActions()}>
                        {(action) => (
                          <DropdownMenu.Item
                            class="flex items-center gap-2 px-2 py-1.5 text-sm text-ink rounded-md cursor-pointer outline-none hover:bg-ink/10"
                            onSelect={() => {
                              void action.onClick?.({ message: message() });
                            }}
                          >
                            <span class="size-4">
                              {renderIcon(action.icon, 'w-full h-full')}
                            </span>
                            {action.label}
                          </DropdownMenu.Item>
                        )}
                      </For>
                    </DropdownMenu.Content>
                  </Layer>
                </DropdownMenu.Portal>
              </DropdownMenu>
            </Show>
          </div>
        </Layer>
      </HoverActions>
    </Show>
  );
}
