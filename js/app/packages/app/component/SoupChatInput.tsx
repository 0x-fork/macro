import { useChatInput } from '@core/component/AI/component/input/useChatInput';
import { setPendingSendForChat } from '@core/component/AI/signal/pendingSend';
import type { CreateAndSend, Send } from '@core/component/AI/types';
import { registerHotkey } from '@core/hotkey/hotkeys';
import type { LexicalEditor } from 'lexical';
import { createSignal, onCleanup, onMount } from 'solid-js';
import { useSplitLayout } from './split-layout/layout';
import { useSplitPanelOrThrow } from './split-layout/layoutUtils';

export function SoupChatInput() {
  const { replaceSplit } = useSplitLayout();
  const splitContext = useSplitPanelOrThrow();
  const [chatEditor, setChatEditor] = createSignal<LexicalEditor>();

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

  // Register keyboard shortcut to focus the chat input
  onMount(() => {
    const { dispose } = registerHotkey({
      hotkey: ['cmd+i', 'ctrl+i'],
      scopeId: splitContext.splitHotkeyScope,
      description: 'Focus chat input',
      keyDownHandler: () => {
        const editor = chatEditor();
        if (editor) {
          editor.focus(undefined, { defaultSelection: 'rootStart' });
          return true;
        }
        return false;
      },
      displayPriority: 5,
    });

    onCleanup(() => {
      dispose();
    });
  });

  return (
    <div class="fixed bottom-0 left-0 right-0 flex w-full justify-center pointer-events-none z-10">
      <div class="w-full max-w-3xl pointer-events-auto">
        <ChatInput
          onSend={handleSend}
          isPersistent={true}
          autoFocusOnMount={false}
          captureEditor={setChatEditor}
        />
      </div>
    </div>
  );
}
