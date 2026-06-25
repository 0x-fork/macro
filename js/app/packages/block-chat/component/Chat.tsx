import { useAnalytics } from '@app/component/analytics-context';
import { FloatRegionOrInline } from '@app/component/mobile/float-regions/FloatRegion';
import { useMaybePreviewPanel } from '@app/component/PreviewPanel';
import { SplitToolbarLeft } from '@app/component/split-layout/components/SplitToolbar';
import { useNavigatedFromJK } from '@app/component/useNavigatedFromJK';
import type { SendBuilder } from '@block-chat/blockClient';
import { TopBar } from '@block-chat/component/TopBar';
import type { ChatData } from '@block-chat/definition';
import { pendingLocationParamsSignal } from '@block-chat/signal/pendingLocationParams';
import { useBlockId, useIsNestedBlock } from '@core/block';
import { DragDropWrapper } from '@core/component/AI/component/DragDrop';
import { buildChatEditor } from '@core/component/AI/component/input/buildChatEditor';
import type { ChatSendInput } from '@core/component/AI/component/input/buildRequest';
import {
  useResolveChatToolCalls,
  useSendChatMessage,
} from '@core/component/AI/component/input/buildRequest';
import type { ResolveDecision } from '@core/component/AI/component/input/PermissionDialog';
import { ChatMessages } from '@core/component/AI/component/message/ChatMessages';
import {
  ChatInputProvider,
  ChatProvider,
  useChatContext,
  useChatInputContext,
} from '@core/component/AI/context';
import { useEntityDropAttachment } from '@core/component/AI/hook/useEntityDropAttachment';
import { useGetChatAttachmentInfo } from '@core/component/AI/signal/attachment';
import {
  getPendingSend,
  peekPendingSend,
} from '@core/component/AI/signal/pendingSend';
import { registerToolHandler } from '@core/component/AI/signal/tool';
import { canSend } from '@core/component/AI/state/chatState';
import type { AssistantMessagePart } from '@core/component/AI/types';
import { deriveChatName } from '@core/component/AI/util/deriveName';
import { parseModel } from '@core/component/AI/util/parse';
import {
  getChatInputStoredState,
  type StoredStuff,
  storeChatState,
} from '@core/component/AI/util/storage';
import { CustomScrollbar } from '@core/component/CustomScrollbar';
import { DEV_MODE_ENV } from '@core/constant/featureFlags';
import { usePaywallState } from '@core/constant/PaywallState';
import { TOKENS } from '@core/hotkey/tokens';
import { registerScopeSignalHotkey } from '@core/hotkey/utils';
import { createMethodRegistration } from '@core/orchestrator';
import {
  blockElementSignal,
  blockHotkeyScopeSignal,
} from '@core/signal/blockElement';
import { blockHandleSignal } from '@core/signal/load';
import { useCanEdit } from '@core/signal/permissions';
import { createRenameDssEntityMutation } from '@macro-entity';
import ChatDebugIcon from '@phosphor/chat-text.svg';
import { invalidateUserQuota } from '@queries/auth';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { createCallback } from '@solid-primitives/rootless';
import { Button } from '@ui';
import { ChatInput } from 'core/component/AI/component/input/ChatInput';
import {
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  Show,
  Suspense,
} from 'solid-js';

export function Chat(props: { data: ChatData }) {
  const loadedState = getChatInputStoredState(props.data.chat.id);
  const { showPaywall } = usePaywallState();

  // Seed the model selector, highest priority first:
  //  1. peekPendingSend — the model the user just sent with in the soup chat
  //     input, carried over the new-chat redirect and reflected in the new chat.
  //  2. loadedState.model — the per-chat draft: a model picked in this chat's
  //     input but not yet sent (persisted per chat id, so it survives reload /
  //     navigation, just like the draft text and attachments).
  //  3. the chat's stored model.
  // The chat input reconciles to an available model if the user isn't entitled
  // to this one.
  const initialModel =
    peekPendingSend()?.model ??
    loadedState.model ??
    parseModel(props.data.chat.model);

  return (
    <ChatInputProvider
      initialAttachments={loadedState.attachments}
      model={initialModel}
    >
      <ChatProvider
        chatId={props.data.chat.id}
        messages={props.data.chat.messages}
        controllerOptions={{ onShowPaywall: showPaywall }}
      >
        <ChatInner data={props.data} loadedInputText={loadedState.input} />
      </ChatProvider>
    </ChatInputProvider>
  );
}

function ChatInner(props: {
  data: ChatData;
  loadedInputText: string | undefined;
}) {
  const owner = getOwner();
  const analytics = useAnalytics();
  const input = useChatInputContext();
  const chat = useChatContext();
  const canEdit = useCanEdit();
  const disabled = () => !canEdit();
  const scopeId = blockHotkeyScopeSignal.get;
  const blockElement = blockElementSignal.get;
  const { navigatedFromJK } = useNavigatedFromJK();
  const isPreview = !!useMaybePreviewPanel();
  const [scrollRef, setScrollRef] = createSignal<HTMLElement>();
  const [showStreamDebug, setShowStreamDebug] = createSignal(false);
  const [markdownText, setMarkdownText] = createSignal(
    props.loadedInputText ?? ''
  );

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

  // Sync isGenerating from controller phase
  createEffect(() => {
    input.setIsGenerating(chat.isGenerating());
    if (chat.isGenerating()) invalidateUserQuota();
  });

  const blockHandle = blockHandleSignal.get;

  // Entity drag-and-drop support
  const chatId = useBlockId();
  const { droppable, isDraggingOver } = useEntityDropAttachment(
    'chat-input-' + chatId,
    input.attachments
  );
  false && droppable;

  registerToolHandler(() => {
    const s = chat.stream();
    if (!s) return undefined;
    return { data: s.data };
  });

  const sendChatMessage = useSendChatMessage();
  const renameMutation = createRenameDssEntityMutation();

  const onSend = createCallback(async (request: ChatSendInput) => {
    // Single send precondition (idle ∧ ready): a suspended chat must resolve its
    // pending tool calls (via the dialog) before a new message can be sent.
    if (!canSend(chat.phase())) return;
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

    chat.dispatch({ type: 'stream_connected', stream: result.stream, owner });
    invalidateUserQuota();
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

  // The chat's suspended chain, when awaiting tool permission. The exposed
  // `idle` phase OWNS the derived message-chain (recomputed reactively and on
  // mount), so a refresh / another device reconstructs the dialog from the
  // persisted messages alone. The chain only exists on `idle`, so this is also
  // implicitly gated to the idle phase (not streaming / sending).
  const suspendedChain = createMemo(() => {
    const phase = chat.phase();
    return phase.type === 'idle' && phase.messageChain.type === 'suspended'
      ? phase.messageChain
      : undefined;
  });

  // The dialog shows iff the chain is suspended (which already implies idle).
  const showDialog = createMemo(() => suspendedChain() !== undefined);

  const resolveChatToolCalls = useResolveChatToolCalls();

  // Guards re-entrancy across BOTH the dialog buttons and the keyboard
  // shortcuts (Enter/Escape go through `onAccept`/`onDeny` directly, bypassing
  // the dialog's own busy state), so a fast double Enter can't double-submit.
  const [resolving, setResolving] = createSignal(false);

  // Replace the suspended message's parts in the chain with the server-resolved
  // parts (which include the accepted tool's server-computed result, the
  // "denied"/"cancelled" markers, etc. — the frontend cannot construct these).
  // Suspension is derived from the chain, so patching clears (or keeps) the
  // dialog automatically.
  const patchResolvedMessage = (
    messageId: string,
    parts: AssistantMessagePart[]
  ) => {
    chat.setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: parts } : m))
    );
  };

  // Apply accept/deny decisions for the pending tool calls. The server returns
  // the resolved `parts` (and, on resume, a fresh `stream_id` for the
  // continuation). We splice the parts into the message by id — suspension
  // re-derives automatically — and, on resume, subscribe to the fresh stream so
  // the continuation merges into the SAME message bubble (in place, by id).
  const onResolve = createCallback(async (decisions: ResolveDecision[]) => {
    if (!suspendedChain() || resolving()) return;
    setResolving(true);
    try {
      const result = await resolveChatToolCalls({
        chatId: chat.chatId(),
        model: input.model(),
        toolset: { type: 'all' },
        action: {
          action: 'resolve',
          decisions: decisions.map((d) => ({
            kind: d.kind,
            call_id: d.callId,
          })),
        },
      });

      if ('error' in result) {
        // Leave the chat suspended so the user can retry.
        return;
      }

      if (result.resumed) {
        // Patch the suspended message with the resolved parts so it stays in
        // its slot showing the resolved tool call, then attach the resumed
        // stream (fresh stream_id, message_id == this message's id). The live
        // continuation merges INTO this message by id via `effectiveMessages`,
        // and `stream_done` upserts the finished message in place — so it never
        // leaves its position in the chain.
        patchResolvedMessage(result.messageId, result.parts);
        chat.dispatch({
          type: 'stream_connected',
          stream: result.stream,
          owner,
        });
        invalidateUserQuota();
        return;
      }

      // Partial resolve — patch the message with the server-resolved parts; the
      // derived chain stays suspended on the remainder (or clears).
      patchResolvedMessage(result.messageId, result.parts);
    } finally {
      setResolving(false);
    }
  });

  // The current call the dialog acts on: the first pending tool call. Accept /
  // deny resolve just this one; the backend re-derives and the next pending
  // call (if any) surfaces.
  const currentCall = createMemo(() => suspendedChain()?.unresolved[0]);

  // Single-call accept / deny — reuse the batch `onResolve` with a size-1 batch.
  const onAccept = createCallback(async () => {
    const call = currentCall();
    if (!call) return;
    await onResolve([{ kind: 'accept', callId: call.id }]);
  });
  const onDeny = createCallback(async () => {
    const call = currentCall();
    if (!call) return;
    await onResolve([{ kind: 'deny', callId: call.id }]);
  });

  // Cancel all pending tool calls — never resumes; patch the message with the
  // cancelled parts so each call renders its "cancelled" outcome and the dialog
  // clears via derivation.
  const onCancel = createCallback(async () => {
    if (!suspendedChain() || resolving()) return;
    setResolving(true);
    try {
      const result = await resolveChatToolCalls({
        chatId: chat.chatId(),
        model: input.model(),
        toolset: { type: 'all' },
        action: { action: 'cancel' },
      });
      if ('error' in result) return;
      if (result.resumed) {
        // Cancel never resumes server-side; handle defensively like a resume —
        // patch in place, then attach the stream (merges by id).
        patchResolvedMessage(result.messageId, result.parts);
        chat.dispatch({
          type: 'stream_connected',
          stream: result.stream,
          owner,
        });
        return;
      }
      patchResolvedMessage(result.messageId, result.parts);
    } finally {
      setResolving(false);
    }
  });

  const saveChatState = (state: StoredStuff) => {
    storeChatState(props.data.chat.id, state);
  };

  createEffect(() => {
    const inputText = markdownText();
    const attached = input.attachments.attached();
    const model_ = input.model();
    saveChatState({ attachments: attached, input: inputText, model: model_ });
  });

  const setPendingLocation = pendingLocationParamsSignal.set;

  createMethodRegistration(blockHandle, {
    sendMessage: async (sendRequest: SendBuilder) => {
      onSend({
        content: sendRequest.userRequest,
        model: sendRequest.model ?? input.model(),
        attachments: sendRequest.attachments ?? [],
        toolset: { type: 'all' },
      });
    },
    goToLocationFromParams: (params: Record<string, string>) => {
      setPendingLocation(params);
    },
  });

  // Check for pending send data (e.g., from SoupChatInput) and send it
  const pendingSend = getPendingSend();
  if (pendingSend) {
    onSend({
      content: pendingSend.content,
      model: pendingSend.model ?? input.model(),
      attachments: pendingSend.attachments ?? [],
      toolset: { type: 'all' },
    });
  }

  registerScopeSignalHotkey(scopeId, {
    hotkey: 'enter',
    description: 'Focus Chat Input',
    // While the permission dialog is up, Enter accepts the tool instead (see
    // below); don't steal it to focus the input.
    condition: () => !showDialog(),
    keyDownHandler: () => {
      editor.controls.focus();
      return true;
    },
    hotkeyToken: TOKENS.block.focus,
    hide: true,
  });

  // While the permission dialog is up: Enter accepts the current tool call,
  // Escape denies it. The dialog is the single source for these keys (the
  // buttons are not autofocused), so Enter resolves exactly one accept.
  registerScopeSignalHotkey(scopeId, {
    hotkey: 'enter',
    description: 'Allow tool',
    condition: () => showDialog(),
    keyDownHandler: () => {
      void onAccept();
      return true;
    },
    hotkeyToken: TOKENS.chat.acceptTool,
  });

  registerScopeSignalHotkey(scopeId, {
    hotkey: 'escape',
    description: 'Deny tool',
    condition: () => showDialog(),
    keyDownHandler: () => {
      void onDeny();
      return true;
    },
    hotkeyToken: TOKENS.chat.denyTool,
  });

  // Ctrl+C while AI is generating stops the stream.
  registerScopeSignalHotkey(scopeId, {
    hotkey: 'ctrl+c',
    description: 'Stop AI response',
    condition: () => chat.isGenerating(),
    keyDownHandler: () => {
      void onStop();
      return true;
    },
    hotkeyToken: TOKENS.chat.stop,
  });

  // In preview mode, switching between Soup tabs was causing this createEffect to overflow the stack. We should figure out that root cause, this flag fixes it for now.
  let hasRun = false;
  createEffect(() => {
    if (hasRun) return;
    if (!blockElement()) return;
    if (!navigatedFromJK()) return;
    blockElement()?.focus();
    hasRun = true;
  });

  const isNestedBlock = useIsNestedBlock();

  return (
    <DragDropWrapper
      class="size-full bg-surface overscroll-none overflow-hidden flex flex-col"
      isEntityDraggingOver={isDraggingOver}
    >
      <Show when={!isNestedBlock}>
        <Suspense>
          <TopBar />
        </Suspense>
      </Show>
      <SplitToolbarLeft>
        <Show when={DEV_MODE_ENV}>
          <Button
            size="icon-sm"
            class="rounded-xs"
            onClick={() => setShowStreamDebug((p) => !p)}
            tooltip={
              showStreamDebug() ? 'Hide Stream Debug' : 'Show Stream Debug'
            }
          >
            <ChatDebugIcon />
          </Button>
        </Show>
      </SplitToolbarLeft>
      <Show when={showStreamDebug()}>
        <div class="px-2 py-1 bg-surface border-b border-edge text-ink font-mono text-sm">
          <Show when={chat.stream()} fallback={<div>No active stream</div>}>
            {(stream) => (
              <div class="flex gap-x-4">
                <span>chunks: {stream().data().length}</span>
                <span>isDone: {String(stream().isDone())}</span>
              </div>
            )}
          </Show>
        </div>
      </Show>
      <div class="size-full flex-1 min-h-0 px-2 relative">
        <div class="absolute inset-0 pointer-events-none" use:droppable />
        <div
          data-chat-scroll
          class="h-full min-h-0 overflow-auto scrollbar-hidden"
          ref={setScrollRef}
        >
          <div class="mx-auto w-full max-w-3xl mobile:pt-[calc(var(--mobile-content-inset-top,0)+0.5rem)] mobile:pb-(--mobile-content-inset-bottom)">
            <ChatMessages
              editDisabled={disabled()}
              pendingLocationParams={pendingLocationParamsSignal.get}
            />
          </div>
        </div>
        <CustomScrollbar scrollContainer={scrollRef} />
      </div>
      <Show when={!disabled()}>
        <FloatRegionOrInline region="accessory">
          <div class="flex w-full justify-center pb-2 px-2 mobile:pb-0 mobile:px-(--mobile-chrome-gutter) mobile:pointer-events-auto">
            <div class="w-3xl">
              <ChatInput
                editor={editor}
                initialValue={props.loadedInputText}
                onChange={setMarkdownText}
                chatId={chat.chatId()}
                onSend={onSend}
                onStop={onStop}
                autoFocusOnMount={!isPreview && !navigatedFromJK()}
                permission={{
                  show: showDialog(),
                  onAccept,
                  onDeny,
                  onCancel,
                }}
              />
            </div>
          </div>
        </FloatRegionOrInline>
      </Show>
    </DragDropWrapper>
  );
}
