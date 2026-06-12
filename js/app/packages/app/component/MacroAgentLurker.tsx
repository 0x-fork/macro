import { useAnalytics } from '@app/component/analytics-context';
import { globalSplitManager } from '@app/signal/splitLayout';
import { useHasPaidAccess } from '@core/auth/license';
import { buildChatEditor } from '@core/component/AI/component/input/buildChatEditor';
import type { ChatSendInput } from '@core/component/AI/component/input/buildRequest';
import { ChatInput } from '@core/component/AI/component/input/ChatInput';
import {
  ChatInputProvider,
  useChatInputContext,
} from '@core/component/AI/context';
import { useGetChatAttachmentInfo } from '@core/component/AI/signal/attachment';
import { setPendingSendData } from '@core/component/AI/signal/pendingSend';
import { deriveChatName } from '@core/component/AI/util/deriveName';
import { MACRO_AGENT_NAME } from '@core/constant/macroAgent';
import { PaywallKey, usePaywallState } from '@core/constant/PaywallState';
import { isPaymentError } from '@core/util/handlePaymentError';
import LogoIcon from '@icon/macro-logo.svg';
import { createRenameDssEntityMutation } from '@macro-entity';
import XIcon from '@phosphor/x.svg';
import { invalidateAllSoup } from '@queries/soup/cache';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { cn } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  Show,
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

const MacroAgentInputOverlay = (props: { onClose: () => void }) => (
  <div class="absolute inset-x-0 bottom-2 z-[9999] flex justify-center px-4 pointer-events-none">
    <div class="pointer-events-auto box-border w-full min-w-0 max-w-2xl overflow-hidden rounded-2xl border border-edge-muted bg-surface/72 p-2 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--color-edge-muted)_80%,white),inset_0_0_24px_color-mix(in_oklch,var(--color-ink)_4%,transparent),0_24px_80px_-36px_rgba(0,0,0,0.55),0_8px_24px_-18px_rgba(0,0,0,0.35)] backdrop-blur-xl backdrop-saturate-150 macro-agent-container-grow">
      <div class="mb-1 flex items-center justify-between px-1.5 text-xs text-ink/45">
        <span class="macro-agent-title-to-corner flex items-center gap-1.5 font-medium">
          <LogoIcon class="size-3 text-accent" />
          Ask {MACRO_AGENT_NAME}
        </span>
        <button
          type="button"
          class="rounded-md p-1 text-ink/45 hover:bg-ink/5 hover:text-ink transition-colors"
          onClick={props.onClose}
          aria-label="Close Macro chat"
        >
          <XIcon class="size-3.5" />
        </button>
      </div>
      <div class="macro-agent-input-content-in w-full min-w-0 max-w-full overflow-hidden [&_.ui-surface]:h-auto [&_.ui-surface]:max-w-full [&_.ui-surface]:min-w-0 [&_.ui-surface]:w-full [&_#chat-input]:max-w-full [&_#chat-input]:min-w-0 [&_#chat-input-text-area]:min-w-0">
        <ChatInputProvider>
          <MacroAgentInput onClose={props.onClose} />
        </ChatInputProvider>
      </div>
    </div>
  </div>
);

const MacroAgentCharacter = (props: { reveal: number; onOpen: () => void }) => {
  const underlineOpacity = createMemo(() =>
    clamp01((props.reveal - 0.2) / 0.45)
  );

  return (
    <button
      type="button"
      class={cn(
        'pointer-events-auto relative flex flex-col items-center outline-none transition-[transform,opacity,filter] duration-150 ease-out',
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
            <LogoIcon class="size-4 text-accent" />
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
