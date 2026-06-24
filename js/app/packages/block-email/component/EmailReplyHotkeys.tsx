import { useEmailContext } from '@block-email/component/EmailContext';
import { getEmailFormRegistry } from '@block-email/component/EmailFormContext';
import { isReplyAllEligible } from '@block-email/util/recipientConversion';
import type { ReplyType } from '@block-email/util/replyType';
import { useEmail } from '@core/context/user';
import { TOKENS } from '@core/hotkey/tokens';
import { registerScopeSignalHotkey } from '@core/hotkey/utils';
import { blockHotkeyScopeSignal } from '@core/signal/blockElement';

/**
 * Registers the Superhuman-style `r` / `shift+r` / `f` reply, reply-all and
 * forward shortcuts for an email thread.
 *
 * Rendered inside the {@link EmailFormContextProvider} so the handlers can
 * reach the form registry (which derives recipients/subject from the message
 * being replied to). Pressing one opens the reply input for the focused
 * message, or the last message in the thread when nothing is focused, mirroring
 * the inline reply/forward buttons.
 *
 * Registration is bound to the block's hotkey scope signal (via
 * {@link registerScopeSignalHotkey}) rather than a one-shot read, so the
 * shortcuts re-register if the scope changes (e.g. navigating between threads
 * without remounting this view).
 */
export function EmailReplyHotkeys() {
  const scopeId = blockHotkeyScopeSignal.get;
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
      type === 'reply-all' && !isReplyAllEligible(target, userEmail() ?? '')
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

  registerScopeSignalHotkey(scopeId, {
    hotkey: 'r',
    description: 'Reply',
    keyDownHandler: () => startReply('reply'),
    hotkeyToken: TOKENS.email.reply,
    displayPriority: 9,
  });
  registerScopeSignalHotkey(scopeId, {
    hotkey: 'shift+r',
    description: 'Reply all',
    keyDownHandler: () => startReply('reply-all'),
    hotkeyToken: TOKENS.email.replyAll,
    displayPriority: 8,
  });
  registerScopeSignalHotkey(scopeId, {
    hotkey: 'f',
    description: 'Forward',
    keyDownHandler: () => startReply('forward'),
    hotkeyToken: TOKENS.email.forward,
    displayPriority: 7,
  });

  return null;
}
