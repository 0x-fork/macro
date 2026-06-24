import { useEmailContext } from '@block-email/component/EmailContext';
import { getEmailFormRegistry } from '@block-email/component/EmailFormContext';
import { isReplyAllEligible } from '@block-email/util/recipientConversion';
import type { ReplyType } from '@block-email/util/replyType';
import { useEmail } from '@core/context/user';
import type { HotkeyGroup } from '@core/hotkey/types';
import { onCleanup, onMount } from 'solid-js';
import { registerReplyHotkeys } from '../util/emailHotkeys';

/**
 * Registers the `r` / `shift+r` / `f` reply, reply-all and forward shortcuts.
 *
 * Rendered inside the {@link EmailFormContextProvider} so the handlers can
 * reach the form registry (which derives recipients/subject from the message
 * being replied to). Pressing one opens the reply input for the focused
 * message, or the last message in the thread when nothing is focused, mirroring
 * the inline reply/forward buttons.
 */
export function EmailReplyHotkeys(props: { scopeId: string }) {
  const ctx = useEmailContext();
  const formRegistry = getEmailFormRegistry();
  const userEmail = useEmail();

  const startReply = (type: ReplyType): boolean => {
    if (!ctx.permissions().isOwner) return false;

    const messages = ctx.messages.list();
    if (!messages.length) return false;

    const lastMessage = messages[messages.length - 1];
    const focusedId = ctx.messages.focusedID();
    const target =
      (focusedId && messages.find((m) => m.db_id === focusedId)) || lastMessage;

    const messageId = target.db_id;
    if (!messageId) return false;

    // Fall back to a plain reply when there's no one else to reply-all to.
    const resolvedType: ReplyType =
      type === 'reply-all' &&
      !isReplyAllEligible(target, userEmail() ?? '')
        ? 'reply'
        : type;

    const form = formRegistry.getOrInit({
      type: 'replying_to',
      messageID: messageId,
    });
    form.setReplyType(resolvedType);
    form.setShouldFocusInput(true);

    if (messageId === lastMessage.db_id) {
      // The last message's reply input lives at the bottom of the thread.
      ctx.messages.setBottomReplyOpen(true);
    } else {
      // Earlier messages reply inline; ensure the body is expanded so the
      // inline reply input is rendered.
      ctx.messages.setExpandedBodyId(messageId, true);
      ctx.messages.setReplyingToMessageId(messageId);
    }

    return true;
  };

  let group: HotkeyGroup | undefined;
  onMount(() => {
    group = registerReplyHotkeys(props.scopeId, {
      reply: () => startReply('reply'),
      replyAll: () => startReply('reply-all'),
      forward: () => startReply('forward'),
    });
  });
  onCleanup(() => group?.dispose());

  return null;
}
