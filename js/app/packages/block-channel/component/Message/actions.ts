import { getUrlToMessage } from '@block-channel/utils/link';
import { useSplitLayout } from '@app/component/split-layout/layout';
import { useBlockId } from '@core/block';
import { useUserId } from '@core/context/user';
import { createAiTaskFromMessage } from '@core/util/createAiTaskFromMessage';
import { showTaskCreatedToast } from '@core/util/showTaskCreatedToast';
import { logger } from '@observability';
import ReplyIcon from '@phosphor-icons/core/regular/arrow-bend-up-left.svg?component-solid';
import CopyIcon from '@phosphor-icons/core/regular/copy.svg?component-solid';
import LinkIcon from '@phosphor-icons/core/regular/link.svg?component-solid';
import Pencil from '@phosphor-icons/core/regular/pencil.svg?component-solid';
import Trash from '@phosphor-icons/core/regular/trash.svg?component-solid';
import Spinner from '@icon/regular/spinner.svg';
import StatusCreated from '@macro-icons/square/task-created.svg';
import { useDeleteMessageMutation } from '@queries/channel/message';
import { toast } from 'core/component/Toast/Toast';
import type { Accessor, Component, JSX } from 'solid-js';
import { createMemo, createSignal } from 'solid-js';

export type MessageAction = {
  text: string;
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  onClick: () => void | Promise<void>;
  enabled: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  closeOnSelect?: boolean;
  showInActionMenu?: boolean;
};

const CreateTaskIcon: Component<JSX.SvgSVGAttributes<SVGSVGElement>> = (
  props
) => StatusCreated({ class: props.class });

const LoadingTaskIcon: Component<JSX.SvgSVGAttributes<SVGSVGElement>> = (
  props
) => Spinner({ class: `${props.class ?? ''} animate-spin` });

export function createMessageActions(params: {
  channelId: string;
  messageId: string;
  messageContent: string;
  threadId?: string;
  senderId: string;
  onEdit: () => void;
  onReply: () => void;
}): Accessor<MessageAction[]> {
  const blockId = useBlockId();
  const userId = useUserId();
  const { openWithSplit } = useSplitLayout();

  const deleteMessageMutation = useDeleteMessageMutation();
  const [creatingTask, setCreatingTask] = createSignal(false);

  const deleteMessage = () => {
    deleteMessageMutation.mutate({
      channelID: params.channelId,
      messageID: params.messageId,
    });
  };

  function copyLinkToMessage() {
    const normalizedThreadId =
      params.threadId == null ? undefined : String(params.threadId);
    const url = getUrlToMessage(blockId, params.messageId, normalizedThreadId);
    navigator.clipboard.writeText(url);
    toast.success('Link copied to clipboard');
  }

  function copyMessageText() {
    const text = params.messageContent;
    if (!text) return toast.failure('No message to copy');

    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success('Message copied to clipboard');
      })
      .catch((cause) => {
        logger.error('failed to copy message', { cause });
        toast.failure('Failed to copy message');
      });
  }

  async function createAiTask() {
    if (creatingTask()) return;

    setCreatingTask(true);

    try {
      const task = await createAiTaskFromMessage({
        messageContent: params.messageContent,
        currentUserId: userId(),
      });

      if (!task) {
        toast.failure('Failed to create task');
        return;
      }

      await showTaskCreatedToast({
        documentId: task.documentId,
        taskTitle: task.title,
        taskContent: task.content,
        openTask: ({ preferNewSplit } = {}) => {
          openWithSplit(
            { type: 'task', id: task.documentId },
            { referredFrom: null, preferNewSplit }
          );
        },
      });
    } catch (cause) {
      logger.error('failed to create ai task from message', {
        cause,
        messageId: params.messageId,
      });
      toast.failure('Failed to create task');
    } finally {
      setCreatingTask(false);
    }
  }

  return createMemo<MessageAction[]>(() => [
    {
      text: 'Reply',
      onClick: params.onReply,
      enabled: !params.threadId,
      icon: ReplyIcon,
    },
    {
      text: 'Copy Link',
      onClick: copyLinkToMessage,
      icon: LinkIcon,
      enabled: true,
    },
    {
      text: 'Copy Message',
      onClick: copyMessageText,
      icon: CopyIcon,
      enabled: true,
    },
    {
      text: 'Create AI Task',
      onClick: createAiTask,
      icon: creatingTask() ? LoadingTaskIcon : CreateTaskIcon,
      enabled: true,
      disabled: creatingTask(),
      closeOnSelect: false,
    },
    {
      text: 'Edit Message',
      onClick: params.onEdit,
      enabled: userId() === params.senderId,
      icon: Pencil,
      dividerBefore: true,
    },
    {
      text: 'Delete Message',
      onClick: deleteMessage,
      enabled: userId() === params.senderId,
      icon: Trash,
    },
  ]);
}
