import { useAnalytics } from '@app/component/analytics-context';
import { isListViewID } from '@app/constants/list-views';
import type { BlockName } from '@core/block';
import { buildChatEditor } from '@core/component/AI/component/input/buildChatEditor';
import type { ChatSendInput } from '@core/component/AI/component/input/buildRequest';
import {
  ChatInputProvider,
  useChatInputContext,
} from '@core/component/AI/context';
import { useGetChatAttachmentInfo } from '@core/component/AI/signal/attachment';
import { setPendingSendData } from '@core/component/AI/signal/pendingSend';
import { deriveChatName } from '@core/component/AI/util/deriveName';
import { Hotkey } from '@core/component/Hotkey';
import { Tooltip } from '@core/component/Tooltip';
import { useHasPaidAccess } from '@core/auth/license';
import { ENABLE_SNAPSHOT_NODE } from '@core/constant/featureFlags';
import { PaywallKey, usePaywallState } from '@core/constant/PaywallState';
import type { ItemMention } from '@core/component/LexicalMarkdown/plugins/mentions';
import { pressedKeys } from '@core/hotkey/state';
import { TOKENS } from '@core/hotkey/tokens';
import { isPaymentError } from '@core/util/handlePaymentError';
import { isErr } from '@core/util/maybeResult';
import { createRenameDssEntityMutation } from '@macro-entity';
import { invalidateAllSoup } from '@queries/soup/cache';
import { cognitionApiServiceClient } from '@service-cognition/client';
import { ChatInput } from 'core/component/AI/component/input/ChatInput';
import { registerHotkey } from 'core/hotkey/hotkeys';
import { createEffect, createSignal, on, onCleanup, Show } from 'solid-js';
import { useSplitPanelOrThrow } from './split-layout/layoutUtils';
import clickOutside from '@core/directive/clickOutside';

false && clickOutside;

const BLOCK_TO_MENTION_TYPE: Partial<
  Record<BlockName, ItemMention['itemType']>
> = {
  write: 'document',
  pdf: 'document',
  md: 'document',
  code: 'document',
  image: 'document',
  canvas: 'document',
  video: 'document',
  channel: 'channel',
  email: 'thread',
  project: 'project',
};

function FloatingChatInputInner() {
  const splitPanelContext = useSplitPanelOrThrow();

  const shouldEnable = () => {
    const content = splitPanelContext.handle.content();
    if (isListViewID(content.id)) return false;
    if (content.type === 'chat') return false;
    return true;
  };

  const [visible, setVisible] = createSignal(false);

  createEffect(
    on(
      () => splitPanelContext.handle.content(),
      () => setVisible(false),
      { defer: true }
    )
  );

  const { dispose: disposeHotkey } = registerHotkey({
    hotkey: 'cmd+j',
    scopeId: splitPanelContext.splitHotkeyScope,
    hotkeyToken: TOKENS.chat.input.focus,
    description: 'Focus AI chat',
    condition: shouldEnable,
    runWithInputFocused: true,
    registrationType: 'add',
    keyDownHandler: () => {
      setVisible(true);
      return true;
    },
  });
  onCleanup(disposeHotkey);

  return (
    <Show when={visible()}>
      <FloatingChatInputEditor
        onHide={() => {
          setVisible(false);
          splitPanelContext.panelRef()?.focus();
        }}
      />
    </Show>
  );
}

function FloatingChatInputEditor(props: { onHide: () => void }) {
  const analytics = useAnalytics();
  const splitPanelContext = useSplitPanelOrThrow();
  const input = useChatInputContext();
  const hasPaid = useHasPaidAccess();

  const { getAttachmentFromMention } = useGetChatAttachmentInfo();

  const editor = buildChatEditor().withMentions({
    onCreate: (mention) => {
      analytics.track('mentions_menu_use', { itemType: 'chat' });
      const attachment = getAttachmentFromMention(mention);
      if (attachment) input.attachments.addAttachment(attachment);
    },
    block: 'chat',
    showOpenTabs: true,
    useSnapshotForDocuments: ENABLE_SNAPSHOT_NODE,
  });

  const [chatHasFocus, setChatHasFocus] = createSignal(false);
  const metaHeld = () => chatHasFocus() && pressedKeys().has('cmd');

  const attachContainer = (el: HTMLDivElement) => {
    const focusIn = () => setChatHasFocus(true);
    const focusOut = () => setChatHasFocus(false);
    el.addEventListener('focusin', focusIn);
    el.addEventListener('focusout', focusOut);
    onCleanup(() => {
      el.removeEventListener('focusin', focusIn);
      el.removeEventListener('focusout', focusOut);
    });
  };

  // Auto-attach the current entity on mount
  const content = splitPanelContext.handle.content();
  if (content.type !== 'component') {
    const mentionType = BLOCK_TO_MENTION_TYPE[content.type as BlockName];
    if (mentionType) {
      const attachment = getAttachmentFromMention({
        itemId: content.id,
        itemType: mentionType,
        documentName: splitPanelContext.handle.displayName(),
      });
      if (attachment) {
        input.attachments.addAttachment(attachment);
      }
    }
  }

  const renameMutation = createRenameDssEntityMutation();

  const handleSend = async (request: ChatSendInput) => {
    if (!hasPaid()) {
      const { showPaywall } = usePaywallState();
      showPaywall(PaywallKey.CHAT_LIMIT);
      return;
    }

    const backgroundSend = request.metaKey;

    const response = await cognitionApiServiceClient.createChat({});
    if (isErr(response)) {
      if (isPaymentError(response)) {
        const { showPaywall } = usePaywallState();
        showPaywall(PaywallKey.CHAT_LIMIT);
      }
      return;
    }
    const [, { id: chatId }] = response;

    const name = deriveChatName(request.content);
    if (name) {
      renameMutation.mutate({
        entity: { type: 'chat', id: chatId, name: '', ownerId: '' },
        newName: name,
      });
    }

    props.onHide();

    if (backgroundSend) {
      cognitionApiServiceClient.sendStreamChatMessage({
        content: request.content,
        model: request.model,
        chat_id: chatId,
        attachments:
          request.attachments.length > 0 ? request.attachments : undefined,
        toolset: { type: 'all' },
      });
      invalidateAllSoup();
    } else {
      setPendingSendData({
        content: request.content,
        attachments: request.attachments,
        model: request.model,
      });

      splitPanelContext.handle.replace({
        next: { type: 'chat', id: chatId },
      });
    }
  };

  return (
    <div
      ref={attachContainer}
      use:clickOutside={() => props.onHide()}
      class="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl px-4 pointer-events-auto"
    >
      <ChatInput
        editor={editor}
        onSend={handleSend}
        onEscape={() => {
          props.onHide();
          return true;
        }}
        isPersistent={false}
        autoFocusOnMount={true}
        extraRightControls={() => (
          <Tooltip tooltip="⌘ Enter to send in background" placement="top">
            <div
              class="flex items-center gap-1"
              classList={{
                'text-accent': metaHeld(),
              }}
            >
              <div
                class="flex border text-[0.625rem] rounded-xs items-center px-1 py-0.5"
                classList={{
                  'border-accent text-accent': metaHeld(),
                  'border-edge-muted': !metaHeld(),
                }}
              >
                <Hotkey shortcut="cmd+Enter" />
              </div>
              <span>Background</span>
            </div>
          </Tooltip>
        )}
      />
    </div>
  );
}

export function FloatingChatInput() {
  return (
    <ChatInputProvider>
      <FloatingChatInputInner />
    </ChatInputProvider>
  );
}
