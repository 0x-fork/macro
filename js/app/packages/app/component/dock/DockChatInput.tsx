import { withAnalytics } from '@coparse/analytics';
import { DragDropWrapper } from '@core/component/AI/component/DragDrop';
import { AttachmentList } from '@core/component/AI/component/input/Attachment';
import { useBuildChatSendRequest } from '@core/component/AI/component/input/buildRequest';
import { SendMessageButton } from '@core/component/AI/component/input/SendMessageButton';
import { useChatMarkdownArea } from '@core/component/AI/component/input/useChatMarkdownArea';
import { DEFAULT_MODEL } from '@core/component/AI/constant';
import {
  useAttachments,
  useChatAttachableHistory,
} from '@core/component/AI/signal/attachment';
import type { Attachment } from '@core/component/AI/types';
import { useUploadAttachment } from '@core/component/AI/util/uploadToChat';
import { setIsRightPanelOpen } from '@core/signal/layout';
import {
  getRightbarOnSend,
  rightbarChatId,
  setDockChatAttachments,
  setDockChatText,
} from '@core/signal/rightbar';
import { createCallback } from '@solid-primitives/rootless';
import { createEffect, createSignal, Show } from 'solid-js';

const { track, TrackingEvents } = withAnalytics();

export function DockChatInput() {
  const uploadQueue = useUploadAttachment();
  const attachments = useAttachments();

  const chatMarkdownArea = useChatMarkdownArea({
    addAttachment: (a: Attachment) => {
      track(TrackingEvents.CHAT.ATTACHMENT.ADD);
      attachments.addAttachment(a);
    },
  });

  const [isGenerating] = createSignal(false);

  // Handle completed uploads
  createEffect(() => {
    const uploaded = uploadQueue.popComplete();
    uploaded
      .filter((upload) => upload.type === 'ok')
      .forEach((upload) => {
        track(TrackingEvents.CHAT.ATTACHMENT.ADD);
        attachments.addAttachment(upload.attachment);
      });
  });

  // Sync state to shared signals so rightbar can pick it up when panel opens
  createEffect(() => {
    const text = chatMarkdownArea.markdownText();
    const attached = attachments.attached();
    setDockChatText(text);
    setDockChatAttachments(attached);
  });

  const isEmptyInput = () =>
    chatMarkdownArea.markdownText().trim().length === 0;
  const hasUploadingAttachments = () => uploadQueue.uploading().length > 0;
  const canSendMessage = () =>
    !isEmptyInput() && !isGenerating() && !hasUploadingAttachments();

  const buildChatSendRequest = useBuildChatSendRequest();

  const sendMessage = createCallback(async () => {
    if (!canSendMessage()) return;

    const request = await buildChatSendRequest({
      chatId: rightbarChatId(),
      userRequest: chatMarkdownArea.markdownText(),
      isPersistent: true,
      attachments: attachments.attached(),
      model: DEFAULT_MODEL,
      toolset: { type: 'all' },
      source: 'everything',
    });

    // Clear input
    chatMarkdownArea.clear();
    attachments.setAttached([]);
    setDockChatText('');
    setDockChatAttachments([]);

    // Open the panel
    setIsRightPanelOpen(true);

    // Send through registered onSend
    const onSend = getRightbarOnSend();
    if (onSend) {
      await onSend(request);
    }
  });

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

  const availableAttachments = useChatAttachableHistory();

  return (
    <DragDropWrapper
      class="flex-1 flex items-center min-w-0"
      uploadQueue={uploadQueue}
      overlayMessage="Drop to attach"
    >
      <div class="flex-1 flex items-center gap-2 min-w-0 px-2">
        <div class="flex-1 min-w-0 flex items-center">
          <div class="w-full text-sm">
            <chatMarkdownArea.MarkdownArea
              onEnter={handleEnter}
              placeholder="Ask AI - @mention anything"
              history={availableAttachments}
              dontFocusOnMount
              onPasteFile={uploadQueue.upload}
            />
          </div>
        </div>

        <Show when={attachments.attached().length > 0}>
          <div class="flex items-center max-w-[200px] overflow-hidden">
            <AttachmentList
              attached={attachments.attached}
              removeAttachment={(id) => {
                track(TrackingEvents.CHAT.ATTACHMENT.REMOVE);
                attachments.removeAttachment(id);
              }}
              uploading={() =>
                uploadQueue.uploading().map((u) => u.preview)
              }
            />
          </div>
        </Show>

        <SendMessageButton
          isDisabled={() => !canSendMessage()}
          onClick={() => {
            track(TrackingEvents.CHAT.MESSAGE.SEND);
            sendMessage();
          }}
        />
      </div>
    </DragDropWrapper>
  );
}

