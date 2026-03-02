import { useSoup } from '@app/component/next-soup/soup-context';
import type { ChatSendInput } from '@core/component/AI/component/input/buildRequest';
import {
  ChatInputProvider,
  useChatInputContext,
} from '@core/component/AI/context';
import { useGetChatAttachmentInfo } from '@core/component/AI/signal/attachment';
import { setPendingSendData } from '@core/component/AI/signal/pendingSend';
import { buildChatEditor } from '@core/component/AI/component/input/buildChatEditor';
import { useAdditionalInstructions } from '@core/component/AI/constant/prompts';
import { ENABLE_SNAPSHOT_NODE } from '@core/constant/featureFlags';
import { TOKENS } from '@core/hotkey/tokens';
import { isErr } from '@core/util/maybeResult';
import { withAnalytics } from '@coparse/analytics';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { ChatInput } from 'core/component/AI/component/input/ChatInput';
import { registerHotkey, useHotkeyDOMScope } from 'core/hotkey/hotkeys';
import { onMount, Show } from 'solid-js';
import { useSplitPanelOrThrow } from './split-layout/layoutUtils';

const { track, TrackingEvents } = withAnalytics();

function SoupChatInputInner() {
  let containerRef!: HTMLDivElement;
  const splitPanelContext = useSplitPanelOrThrow();
  const soup = useSoup();
  const input = useChatInputContext();
  const additionalInstructions = useAdditionalInstructions();

  const { getAttachmentFromMention } = useGetChatAttachmentInfo();

  const editor = buildChatEditor().withMentions({
    onCreate: (mention) => {
      track(TrackingEvents.CHAT.MENTION.SELECT);
      const attachment = getAttachmentFromMention(mention);
      if (attachment) input.attachments.addAttachment(attachment);
    },
    block: 'chat',
    showOpenTabs: true,
    useSnapshotForDocuments: ENABLE_SNAPSHOT_NODE,
  });

  const [attachHotkeys] = useHotkeyDOMScope('soup.chatInput');

  onMount(() => {
    attachHotkeys(containerRef);
  });

  // cmd+j - Focus the soup chat input
  registerHotkey({
    hotkey: 'cmd+j',
    scopeId: splitPanelContext.splitHotkeyScope,
    hotkeyToken: TOKENS.chat.input.focus,
    description: 'Focus chat input',
    keyDownHandler: () => {
      editor.controls.focus();
      return true;
    },
  });

  const handleSend = async (request: ChatSendInput) => {
    // Create a new persistent chat
    const response = await cognitionApiServiceClient.createChat({
      isPersistent: true,
    });
    if (isErr(response)) {
      console.error('Failed to create chat', response);
      return;
    }
    const [, { id: chatId }] = response;

    // Store the pending send data for the chat to pick up
    setPendingSendData({
      content: request.content,
      attachments: request.attachments,
      model: request.model,
    });

    // Replace the soup split with the chat split
    splitPanelContext.handle.replace({
      next: { type: 'chat', id: chatId },
    });
  };

  const handleSendInBackground = async (request: ChatSendInput) => {
    const response = await cognitionApiServiceClient.createChat({
      isPersistent: true,
    });

    if (isErr(response)) {
      console.error('Failed to create chat', response);
      return;
    }

    const [, { id: chatId }] = response;
    const modelInstructions = request.model ? `\nYou are ${request.model}` : '';

    const sendResponse = await cognitionApiServiceClient.sendStreamChatMessage({
      content: request.content,
      model: request.model,
      chat_id: chatId,
      attachments: request.attachments.length ? request.attachments : undefined,
      toolset: request.toolset,
      additional_instructions: `${additionalInstructions()}${modelInstructions}`,
    });

    if (isErr(sendResponse)) {
      console.error('Failed to send message in background', sendResponse);
    }
  };

  return (
    <Show when={!soup.previewEntity()}>
      <div
        ref={containerRef}
        class="absolute z-10 bottom-0 pb-2 px-2 flex justify-center w-full pointer-events-none"
        style={{
          'background-image': `linear-gradient(transparent, var(--color-panel) 85%)`,
        }}
      >
        <div class="w-full max-w-3xl">
          <div class="pointer-events-auto">
            <ChatInput
              editor={editor}
              onSend={handleSend}
              onSendInBackground={handleSendInBackground}
              onEscape={() => {
                splitPanelContext.panelRef()?.focus();
                return true;
              }}
              isPersistent={true}
              autoFocusOnMount={false}
            />
          </div>
        </div>
      </div>
    </Show>
  );
}

export function SoupChatInput() {
  return (
    <ChatInputProvider autoAttach={false}>
      <SoupChatInputInner />
    </ChatInputProvider>
  );
}
