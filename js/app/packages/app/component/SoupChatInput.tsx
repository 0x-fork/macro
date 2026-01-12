import { useBuildChatSendRequest } from '@core/component/AI/component/input/buildRequest';
import { SendMessageButton } from '@core/component/AI/component/input/SendMessageButton';
import { useChatMarkdownArea } from '@core/component/AI/component/input/useChatMarkdownArea';
import { createChat } from '@core/util/create';
import PlusIcon from '@icon/regular/plus.svg';
import { createSignal } from 'solid-js';
import { useSplitLayout } from './split-layout/layout';

export function SoupChatInput() {
  const { replaceSplit } = useSplitLayout();

  const chatMarkdownArea = useChatMarkdownArea({
    addAttachment: () => {
      // For now, we don't support attachments in the Soup chat input
      // The user can add them once in the chat
    },
  });

  const buildChatSendRequest = useBuildChatSendRequest();
  const [isSending, setIsSending] = createSignal(false);

  const isEmptyInput = () => chatMarkdownArea.markdownText().trim().length === 0;
  const canSendMessage = () => !isEmptyInput() && !isSending();

  const sendMessage = async () => {
    if (!canSendMessage()) return;

    setIsSending(true);
    const messageText = chatMarkdownArea.markdownText();
    chatMarkdownArea.clear();

    try {
      // Create a new chat first
      const result = await createChat({ isPersistent: true });
      if ('error' in result) {
        setIsSending(false);
        return;
      }

      const chatId = result.chatId;

      // Build the send request
      const request = await buildChatSendRequest({
        chatId,
        userRequest: messageText,
        isPersistent: true,
      });

      // Navigate to the chat and let it handle sending the message
      replaceSplit({
        content: { type: 'chat', id: chatId },
        referredFrom: 'soup-chat-input',
      });

      // The chat component will handle sending if we pass the request
      // For now, we navigate and the message will be sent from the chat
      if (request.type === 'send') {
        // Start the stream
        request.call();
      }
    } catch (error) {
      console.error('Failed to create chat:', error);
    } finally {
      setIsSending(false);
    }
  };

  function handleEnter(e: KeyboardEvent): boolean {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSendMessage()) {
        sendMessage();
      }
      return true;
    }
    return false;
  }

  return (
    <div class="flex w-full justify-center px-4">
      <div class="w-full max-w-3xl">
        <div class="flex items-center gap-2 bg-input border border-edge-muted border-b-0 rounded-t-md px-3 py-2">
          <button
            class="flex-shrink-0 text-ink-muted hover:text-ink transition-colors"
            onClick={() => {
              // Focus the input when plus is clicked
              chatMarkdownArea.focus();
            }}
          >
            <PlusIcon class="size-5" />
          </button>
          <div class="flex-1 min-w-0 text-sm">
            <chatMarkdownArea.MarkdownArea
              placeholder="Ask AI - @mention anything"
              onEnter={handleEnter}
              dontFocusOnMount={true}
            />
          </div>
          <div class="flex-shrink-0">
            <SendMessageButton
              isDisabled={() => !canSendMessage()}
              onClick={sendMessage}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
