import { ChatContextProvider } from '@core/component/AI/context';
import { ChatInput } from '@core/component/AI/component/input/useChatInput';
import { useChatMarkdownArea } from '@core/component/AI/component/input/useChatMarkdownArea';
import { useChatContext } from '@core/component/AI/context';
import { setPendingSendData } from '@core/component/AI/signal/pendingSend';
import type { CreateAndSend, Send } from '@core/component/AI/types';
import { isErr } from '@core/util/maybeResult';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { useHotkeyDOMScope } from 'core/hotkey/hotkeys';
import { onMount, Show } from 'solid-js';
import { useSplitPanelOrThrow } from './split-layout/layoutUtils';
import { useSoup } from '@app/component/next-soup/soup-context';

type SoupChatInputProps = {
  variant?: 'docked' | 'centered';
  dockedTall?: boolean;
};

function SoupChatInputInner(props: SoupChatInputProps) {
  let containerRef!: HTMLDivElement;
  const splitPanelContext = useSplitPanelOrThrow();
  const soup = useSoup();
  const ctx = useChatContext();
  const isCentered = () => props.variant === 'centered';
  const isDockedTall = () => !isCentered() && !!props.dockedTall;

  const chatMarkdownArea = useChatMarkdownArea({
    addAttachment: (a) => ctx.attachments.addAttachment(a),
  });

  const [attachHotkeys] = useHotkeyDOMScope('soup.chatInput');

  onMount(() => {
    attachHotkeys(containerRef);
  });

  const handleSend = async (request: Send | CreateAndSend) => {
    if (request.type !== 'createAndSend') return;

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

  return (
    <Show when={!soup.previewEntity()}>
      <div
        ref={containerRef}
        classList={{
          'absolute z-10 bottom-0 pb-0 px-2 flex justify-center w-full pointer-events-none':
            !isCentered(),
          'w-full flex justify-center px-4': isCentered(),
        }}
        style={
          !isCentered()
            ? {
                'background-image': `linear-gradient(transparent, var(--color-panel) 85%)`,
              }
            : undefined
        }
      >
        <div
          classList={{
            'w-full max-w-3xl [&_#chat-input]:rounded-b-none [&_#chat-input]:border-b-0 [&_#chat-input]:transition-[min-height] [&_#chat-input]:duration-200 [&_#chat-input]:ease-out':
              !isCentered(),
            'w-full max-w-3xl [&_#chat-input]:min-h-[92px]': isDockedTall(),
            'w-full max-w-3xl [&_#chat-input]:min-h-[56px]':
              !isCentered() && !isDockedTall(),
            'w-full max-w-3xl scale-[1.06] origin-center [&_#chat-input]:min-h-[100px] [&_#chat-input]:shadow-lg [&_#chat-input]:ring-[0.5px] [&_#chat-input]:ring-edge-muted':
              isCentered(),
          }}
        >
          <div classList={{ 'pointer-events-auto': !isCentered() }}>
            <ChatInput
              markdown={chatMarkdownArea}
              onSend={handleSend}
              isPersistent={true}
              autoFocusOnMount={false}
            />
          </div>
        </div>
      </div>
    </Show>
  );
}

export function SoupChatInput(props: SoupChatInputProps) {
  return (
    <ChatContextProvider autoAttach={false}>
      <SoupChatInputInner variant={props.variant} />
    </ChatContextProvider>
  );
}
