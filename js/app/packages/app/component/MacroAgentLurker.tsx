import { useAnalytics } from '@app/component/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import { useHasPaidAccess } from '@core/auth/license';
import { buildChatEditor } from '@core/component/AI/component/input/buildChatEditor';
import type { ChatSendInput } from '@core/component/AI/component/input/buildRequest';
import { useSendChatMessage } from '@core/component/AI/component/input/buildRequest';
import { ChatInput } from '@core/component/AI/component/input/ChatInput';
import { AssistantMessage } from '@core/component/AI/component/message/AssistantMessage';
import { UserMessage } from '@core/component/AI/component/message/UserMessage';
import {
  ChatInputProvider,
  ChatProvider,
  useChatContext,
  useChatInputContext,
} from '@core/component/AI/context';
import { useGetChatAttachmentInfo } from '@core/component/AI/signal/attachment';
import { setPendingSendData } from '@core/component/AI/signal/pendingSend';
import { toast } from '@core/component/Toast/Toast';
import { deriveChatName } from '@core/component/AI/util/deriveName';
import { asChatMessage } from '@core/component/AI/util/message';
import { MACRO_AGENT_NAME } from '@core/constant/macroAgent';
import { PaywallKey, usePaywallState } from '@core/constant/PaywallState';
import { createChat } from '@core/util/create';
import { isPaymentError } from '@core/util/handlePaymentError';
import { PulsingStar } from '@entity/components/PulsingStar';
import LogoIcon from '@icon/macro-logo.svg';
import { createRenameDssEntityMutation } from '@macro-entity';
import ExpandIcon from '@phosphor/arrows-out-simple.svg';
import MinusIcon from '@phosphor/minus.svg';
import PlusIcon from '@phosphor/plus.svg';
import XIcon from '@phosphor/x.svg';
import { createCallback } from '@solid-primitives/rootless';
import { invalidateUserQuota } from '@queries/auth';
import { invalidateAllSoup } from '@queries/soup/cache';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { connectionGatewayClient } from '@service-connection/client';
import { cn } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  getOwner,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';

const REVEAL_DISTANCE = 180;
const FULL_REVEAL_DISTANCE = 24;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const MacroAgentInput = (props: { onClose: () => void }) => {
  const analytics = useAnalytics();
  const input = useChatInputContext();
  const hasPaid = useHasPaidAccess();
  const renameMutation = createRenameDssEntityMutation();
  const { getAttachmentFromMention } = useGetChatAttachmentInfo();

  const editor = buildChatEditor().withMentions({
    onCreate: (mention) => {
      analytics.track('mentions_menu_use', { itemType: 'chat' });
      const attachment = getAttachmentFromMention(mention);
      if (attachment) input.attachments.addAttachment(attachment);
    },
    block: 'chat',
    showOpenTabs: true,
  });

  const handleSend = async (request: ChatSendInput) => {
    if (!hasPaid()) {
      const { showPaywall } = usePaywallState();
      showPaywall(PaywallKey.CHAT_LIMIT);
      return;
    }

    const response = await cognitionApiServiceClient.createChat({});
    if (response.isErr()) {
      if (isPaymentError(response)) {
        const { showPaywall } = usePaywallState();
        showPaywall(PaywallKey.CHAT_LIMIT);
      }
      return;
    }

    const { id: chatId } = response.value;
    const name = deriveChatName(request.content);
    if (name) {
      renameMutation.mutate({
        entity: { type: 'chat', id: chatId, name: '', ownerId: '' },
        newName: name,
      });
    }

    if (request.metaKey) {
      cognitionApiServiceClient.sendStreamChatMessage({
        content: request.content,
        model: request.model,
        chat_id: chatId,
        attachments:
          request.attachments.length > 0 ? request.attachments : undefined,
        toolset: { type: 'all' },
      });
      invalidateAllSoup();
      props.onClose();
      return;
    }

    setPendingSendData({
      content: request.content,
      attachments: request.attachments,
      model: request.model,
    });

    const manager = globalSplitManager();
    const active = manager?.activeSplit();
    if (active) {
      active.replace({ next: { type: 'chat', id: chatId } });
    } else {
      manager?.createNewSplit({
        content: { type: 'chat', id: chatId },
        activate: true,
        allowDuplicate: true,
        referredFrom: 'launcher',
      });
    }

    props.onClose();
  };

  return (
    <ChatInput
      editor={editor}
      onSend={handleSend}
      onEscape={() => {
        props.onClose();
        return true;
      }}
      isPersistent={true}
      autoFocusOnMount={true}
    />
  );
};


const MacroAgentInlineEmptyState = () => (
  <div class="flex min-h-40 flex-1 flex-col items-center justify-center gap-2 px-6 py-8 text-center text-ink-extra-muted">
    <LogoIcon class="size-6 text-ink/20" />
    <div class="space-y-1">
      <div class="text-sm font-medium text-ink/55">Ask Macro anything</div>
      <div class="text-xs leading-relaxed">
        Start with a question, mention work, or ask for help across Macro.
      </div>
    </div>
  </div>
);

function createMacroChatEditor() {
  const analytics = useAnalytics();
  const input = useChatInputContext();
  const { getAttachmentFromMention } = useGetChatAttachmentInfo();

  return buildChatEditor().withMentions({
    onCreate: (mention) => {
      analytics.track('mentions_menu_use', { itemType: 'chat' });
      const attachment = getAttachmentFromMention(mention);
      if (attachment) input.attachments.addAttachment(attachment);
    },
    block: 'chat',
    showOpenTabs: true,
  });
}

function MacroAgentInlineComposer(props: {
  onClose: () => void;
  onSend: (request: ChatSendInput) => Promise<void> | void;
  chatId?: string;
  onStop?: () => Promise<void> | void;
}) {
  const editor = createMacroChatEditor();

  return (
    <ChatInput
      editor={editor}
      chatId={props.chatId}
      onSend={props.onSend}
      onStop={props.onStop}
      onEscape={() => {
        props.onClose();
        return true;
      }}
      isPersistent={true}
      autoFocusOnMount={true}
    />
  );
}

function MacroAgentInlineChatWithProvider(props: {
  chatId: string;
  initialRequest?: ChatSendInput;
  onInitialRequestSent: () => void;
  onClose: () => void;
}) {
  const owner = getOwner();
  const input = useChatInputContext();
  const chat = useChatContext();
  const sendChatMessage = useSendChatMessage();
  const renameMutation = createRenameDssEntityMutation();

  createEffect(() => {
    input.setIsGenerating(chat.isGenerating());
    if (chat.isGenerating()) invalidateUserQuota();
  });

  const onSend = createCallback(async (request: ChatSendInput) => {
    const isFirstMessage = chat.messages().length === 0;
    const optimisticId = crypto.randomUUID();

    chat.dispatch({
      type: 'send_started',
      optimisticMessage: {
        id: optimisticId,
        content: request.content,
        role: 'user',
        attachments: request.attachments ?? [],
      },
    });

    if (isFirstMessage) {
      const name = deriveChatName(request.content);
      if (name) {
        renameMutation.mutate({
          entity: { type: 'chat', id: chat.chatId(), name: '', ownerId: '' },
          newName: name,
        });
      }
    }

    const result = await sendChatMessage({
      ...request,
      chatId: chat.chatId(),
    });

    if ('error' in result) {
      chat.dispatch({
        type: 'send_failed',
        paymentError: result.paymentError,
      });
      return;
    }

    // Subscribe to the chat entity so the connection gateway routes stream
    // chunks to this inline controller, matching the chat block/command menu.
    connectionGatewayClient.trackEntity({
      entity_type: 'chat',
      entity_id: chat.chatId(),
      action: 'open',
    });

    chat.dispatch({ type: 'stream_connected', stream: result.stream, owner });
    invalidateUserQuota();
  });

  createEffect(() => {
    const request = props.initialRequest;
    if (!request) return;
    props.onInitialRequestSent();
    void onSend(request);
  });

  const onStop = async () => {
    if (!chat.isGenerating()) return;
    const streamId = chat.stream()?.id()?.stream_id;
    if (!streamId) return;
    await cognitionApiServiceClient.stopChatStream({
      chat_id: chat.chatId(),
      stream_id: streamId,
    });
  };

  const generatingMessage = createMemo(() => {
    const s = chat.stream();
    if (!s || s.isDone()) return;
    return asChatMessage(s.data());
  });

  return (
    <>
      <div data-chat-scroll class="min-h-0 flex-1 overflow-auto scrollbar-hidden px-1 py-2">
        <Show
          when={chat.messages().length > 0 || chat.stream()}
          fallback={<MacroAgentInlineEmptyState />}
        >
          <div class="flex flex-col gap-4 text-sm">
            <For each={chat.messages()}>
              {(message) => (
                <Switch>
                  <Match when={message.role === 'user'}>
                    <UserMessage message={message} />
                  </Match>
                  <Match when={message.role === 'assistant'}>
                    <AssistantMessage message={message} />
                  </Match>
                </Switch>
              )}
            </For>
            <Show
              when={generatingMessage()}
              fallback={
                <Show when={chat.isWaiting() || chat.isGenerating()}>
                  <div class="flex items-center gap-2 px-2 py-1 text-xs text-ink-extra-muted">
                    <PulsingStar kind="streamIndicator" animate />
                    <span>Macro is thinking…</span>
                  </div>
                </Show>
              }
            >
              {(message) => (
                <AssistantMessage message={message()} isStreaming />
              )}
            </Show>
          </div>
        </Show>
      </div>
      <div class="shrink-0">
        <MacroAgentInlineComposer
          chatId={props.chatId}
          onClose={props.onClose}
          onSend={onSend}
          onStop={onStop}
        />
      </div>
    </>
  );
}

function MacroAgentInlineChat(props: {
  onClose: () => void;
  onChatIdChange?: (chatId: string | undefined) => void;
  resetKey?: number;
}) {
  const [chatId, setChatId] = createSignal<string>();
  const [initialRequest, setInitialRequest] = createSignal<ChatSendInput>();
  const { showPaywall } = usePaywallState();

  createEffect(() => {
    props.resetKey;
    setChatId(undefined);
    setInitialRequest(undefined);
    props.onChatIdChange?.(undefined);
  });

  const createInlineChat = async (request: ChatSendInput) => {
    const response = await cognitionApiServiceClient.createChat({});
    if (response.isErr()) {
      if (isPaymentError(response)) showPaywall(PaywallKey.CHAT_LIMIT);
      return;
    }
    setInitialRequest(request);
    setChatId(response.value.id);
    props.onChatIdChange?.(response.value.id);
  };

  return (
    <ChatInputProvider>
      <div class="flex h-[28rem] max-h-[calc(100vh-5rem)] min-h-0 flex-col">
        <Show
          when={chatId()}
          fallback={
            <>
              <MacroAgentInlineEmptyState />
              <div class="shrink-0">
                <MacroAgentInlineComposer
                  onClose={props.onClose}
                  onSend={createInlineChat}
                />
              </div>
            </>
          }
        >
          {(id) => (
            <ChatProvider
              chatId={id()}
              messages={[]}
              controllerOptions={{ onShowPaywall: showPaywall }}
            >
              <MacroAgentInlineChatWithProvider
                chatId={id()}
                initialRequest={initialRequest()}
                onInitialRequestSent={() => setInitialRequest(undefined)}
                onClose={props.onClose}
              />
            </ChatProvider>
          )}
        </Show>
      </div>
    </ChatInputProvider>
  );
}

export function MacroAgentInputOverlay(props: {
  onClose: () => void;
  onMinimize?: () => void;
  hidden?: boolean;
  bottomClass?: string;
  positionClass?: string;
  panelClass?: string;
  showEmptyState?: boolean;
  inlineChat?: boolean;
  onActiveChatChange?: (active: boolean) => void;
}) {
  const [inlineChatId, setInlineChatId] = createSignal<string>();
  const [chatKey, setChatKey] = createSignal(1);

  createEffect(() => {
    props.onActiveChatChange?.(!!inlineChatId());
  });

  const startNewChat = () => {
    setInlineChatId(undefined);
    setChatKey((key) => key + 1);
  };

  const expandToSplit = async () => {
    let chatId = inlineChatId();
    if (!chatId) {
      const result = await createChat();
      if ('error' in result || !result.chatId) {
        toast.failure('Unable to start chat');
        return;
      }
      chatId = result.chatId;
      setInlineChatId(chatId);
    }

    const id = chatId;
    globalSplitManager()?.openWithSplit(
      { type: 'chat', id },
      { activate: true, preferNewSplit: true }
    );
    props.onClose();
  };

  return (
    <div
      class={cn(
        'absolute z-[9999] flex pointer-events-none',
        props.hidden && 'hidden',
        props.positionClass ??
          `inset-x-0 ${props.bottomClass ?? 'bottom-2'} justify-center px-4`
      )}
    >
      <div
        class={cn(
          'pointer-events-auto box-border w-full min-w-0 max-w-2xl overflow-hidden rounded-2xl border border-edge-muted bg-surface/72 p-2 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--color-edge-muted)_80%,white),inset_0_0_24px_color-mix(in_oklch,var(--color-ink)_4%,transparent),0_24px_80px_-36px_rgba(0,0,0,0.55),0_8px_24px_-18px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150 macro-agent-container-grow',
          props.panelClass
        )}
      >
        <div class="mb-1 flex items-center justify-between px-1.5 text-xs text-ink/45">
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="macro-agent-title-to-corner flex items-center gap-1.5 font-medium">
              <LogoIcon class="size-3 text-accent" />
              Ask {MACRO_AGENT_NAME}
            </span>
            <Show when={props.inlineChat && inlineChatId()}>
              <button
                type="button"
                class="inline-flex h-5 items-center gap-1 rounded-md bg-ink/6 px-1.5 text-[11px] font-medium text-ink/65 hover:bg-ink/10 hover:text-ink transition-colors"
                onClick={startNewChat}
                aria-label="New Macro chat"
              >
                <PlusIcon class="size-3" />
                <span>New</span>
              </button>
            </Show>
          </div>
          <div class="flex items-center gap-0.5">
            <Show when={props.inlineChat}>
              <button
                type="button"
                class="rounded-md p-1 text-ink/45 hover:bg-ink/5 hover:text-ink transition-colors"
                onClick={props.onMinimize ?? props.onClose}
                aria-label="Minimize Macro chat"
              >
                <MinusIcon class="size-3.5" />
              </button>
              <button
                type="button"
                class="rounded-md p-1 text-ink/45 hover:bg-ink/5 hover:text-ink transition-colors"
                onClick={expandToSplit}
                aria-label="Open Macro chat in split"
              >
                <ExpandIcon class="size-3.5" />
              </button>
            </Show>
            <button
              type="button"
              class="rounded-md p-1 text-ink/45 hover:bg-ink/5 hover:text-ink transition-colors"
              onClick={props.onClose}
              aria-label="Close Macro chat"
            >
              <XIcon class="size-3.5" />
            </button>
          </div>
        </div>
        <div class="macro-agent-input-content-in w-full min-w-0 max-w-full overflow-hidden [&_.ui-surface]:h-auto [&_.ui-surface]:max-w-full [&_.ui-surface]:min-w-0 [&_.ui-surface]:w-full [&_#chat-input]:max-w-full [&_#chat-input]:min-w-0 [&_#chat-input-text-area]:min-w-0">
          <Show
            when={props.inlineChat}
            fallback={
              <>
                <Show when={props.showEmptyState}>
                  <MacroAgentInlineEmptyState />
                </Show>
                <ChatInputProvider>
                  <MacroAgentInput onClose={props.onClose} />
                </ChatInputProvider>
              </>
            }
          >
            <MacroAgentInlineChat
              onClose={props.onClose}
              onChatIdChange={setInlineChatId}
              resetKey={chatKey()}
            />
          </Show>
        </div>
      </div>
    </div>
  );
}

const MacroAgentCharacter = (props: { reveal: number; onOpen: () => void }) => {
  const underlineOpacity = createMemo(() =>
    clamp01((props.reveal - 0.2) / 0.45)
  );

  return (
    <button
      type="button"
      class={cn(
        'ask-macro-button group pointer-events-auto relative flex flex-col items-center outline-none transition-[transform,opacity,filter] duration-150 ease-out',
        props.reveal <= 0.02 && 'pointer-events-none'
      )}
      style={{
        opacity: `${clamp01(props.reveal + 0.08)}`,
        transform: `translateY(${54 - props.reveal * 50}px) scale(${0.92 + props.reveal * 0.08})`,
        filter: `blur(${(1 - props.reveal) * 1.5}px)`,
      }}
      onClick={props.onOpen}
      aria-label="Open Macro agent"
    >
      <div class="relative h-14 w-44">
        <div
          class="absolute left-1/2 top-12 h-px w-24 -translate-x-1/2 bg-linear-to-r from-transparent via-accent/45 to-transparent transition-opacity"
          style={{ opacity: underlineOpacity() }}
        />

        <div class="absolute left-1/2 top-3 z-20 flex h-10 w-fit min-w-0 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border border-edge-muted bg-surface/72 px-3.5 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--color-edge-muted)_85%,white),inset_0_-8px_18px_color-mix(in_oklch,var(--color-edge-muted)_20%,transparent),0_16px_32px_-22px_rgba(0,0,0,0.5)] backdrop-blur-xl backdrop-saturate-150 transition-transform duration-100 ease-out">
          <div class="relative z-10 flex items-center gap-2.5 px-1">
            <LogoIcon class="ask-macro-logo-shimmer size-4 shrink-0 text-accent" />
            <span class="whitespace-nowrap text-xs font-semibold tracking-tight text-ink/75">
              Ask Macro
            </span>
          </div>
        </div>
      </div>
    </button>
  );
};

export const MacroAgentLurker = () => {
  const [cursor, setCursor] = createSignal({ x: 0, y: 0 });
  const [viewport, setViewport] = createSignal({ width: 0, height: 0 });
  const [open, setOpen] = createSignal(false);
  const [wrapperRef, setWrapperRef] = createSignal<HTMLDivElement>();

  createEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    const onPointerMove = (event: PointerEvent) =>
      setCursor({ x: event.clientX, y: event.clientY });

    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    onCleanup(() => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('pointermove', onPointerMove);
    });
  });

  const distance = createMemo(() => {
    const c = cursor();
    const wrapper = wrapperRef();
    const container = wrapper?.offsetParent ?? wrapper?.parentElement;

    const rect =
      container instanceof HTMLElement
        ? container.getBoundingClientRect()
        : {
            left: 0,
            width: viewport().width,
            bottom: viewport().height,
          };

    // Measure proximity to the pill's intended resting hit area, not to the
    // currently translated/offscreen DOM box. Treat it as a small rectangle so
    // approaching any part of the launcher feels consistent.
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.bottom - 8 - 28;
    const halfWidth = 88;
    const halfHeight = 28;
    const dx = Math.max(Math.abs(c.x - centerX) - halfWidth, 0);
    const dy = Math.max(Math.abs(c.y - centerY) - halfHeight, 0);

    return Math.hypot(dx, dy);
  });

  const reveal = createMemo(() =>
    open()
      ? 1
      : clamp01(
          (REVEAL_DISTANCE - distance()) /
            (REVEAL_DISTANCE - FULL_REVEAL_DISTANCE)
        )
  );

  return (
    <>
      <div
        ref={setWrapperRef}
        class="pointer-events-none absolute inset-x-0 bottom-2 z-[9998] flex justify-center overflow-visible"
      >
        <MacroAgentCharacter
          reveal={open() ? 1 : reveal()}
          onOpen={() => setOpen(true)}
        />
      </div>
      <Show when={open()}>
        <MacroAgentInputOverlay onClose={() => setOpen(false)} />
      </Show>
    </>
  );
};
