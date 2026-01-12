import { useChatInput } from '@core/component/AI/component/input/useChatInput';
import { setPendingSendForChat } from '@core/component/AI/signal/pendingSend';
import type { CreateAndSend, Send } from '@core/component/AI/types';
import { useSplitLayout } from './split-layout/layout';

export function SoupChatInput() {
  const { replaceSplit } = useSplitLayout();

  const {
    ChatInput,
    chatMarkdownArea,
    attachments,
    model,
  } = useChatInput();

  const handleSend = async (request: Send | CreateAndSend) => {
    // For Soup, we always get CreateAndSend since there's no chatId yet
    if (request.type === 'createAndSend') {
      // Get the message content before we clear it
      const messageContent = chatMarkdownArea.markdownText();
      const currentAttachments = attachments.attached();
      const currentModel = model();

      // Create the chat
      const response = await request.call();

      if ('type' in response && response.type === 'error') {
        return;
      }

      // response is now a Send type with the chatId
      const chatId = response.request.chat_id;

      // Store the pending send so Chat will auto-send on mount
      setPendingSendForChat({
        chatId,
        content: messageContent,
        attachments: currentAttachments,
        model: currentModel,
      });

      // Navigate to the chat - it will pick up the pending send and execute it
      replaceSplit({
        content: { type: 'chat', id: chatId },
        referredFrom: 'soup-chat-input',
      });
    }
  };

  return (
    <div class="flex w-full justify-center">
      <div class="w-full max-w-3xl">
        <ChatInput
          onSend={handleSend}
          isPersistent={true}
          autoFocusOnMount={false}
        />
      </div>
    </div>
  );
}
