import { useEmail } from '@core/context/user';
import { onCleanup } from 'solid-js';
import { isReplyAllEligible } from '../util/recipientConversion';
import type { ReplyType } from '../util/replyType';
import { useEmailContext } from './EmailContext';
import { getEmailFormRegistry } from './EmailFormContext';

export type OpenReplyCompose = (type: ReplyType) => boolean;

/**
 * Bridges the reply/forward hotkeys — registered by EmailContent, above the
 * form provider — to the compose form registry, which only exists inside
 * EmailFormContextProvider. Mirrors BottomReplyButtons' open sequence:
 * target the thread's last message, set the reply type, focus the input.
 */
export function ReplyHotkeyBridge(props: {
  expose: (open: OpenReplyCompose | undefined) => void;
}) {
  const ctx = useEmailContext();
  const formRegistry = getEmailFormRegistry();
  const userEmail = useEmail();

  const open: OpenReplyCompose = (type) => {
    const lastMessage = ctx.messages.list().at(-1);
    const messageId = lastMessage?.db_id;
    if (!lastMessage || !messageId) return false;
    // Reply-all with no other recipients degrades to a plain reply.
    const resolved =
      type === 'reply-all' &&
      !isReplyAllEligible(lastMessage, userEmail() ?? '')
        ? 'reply'
        : type;
    const form = formRegistry.getOrInit({
      type: 'replying_to',
      messageID: messageId,
    });
    form.setReplyType(resolved);
    form.setShouldFocusInput(true);
    ctx.messages.setBottomReplyOpen(true);
    return true;
  };

  props.expose(open);
  onCleanup(() => props.expose(undefined));

  return null;
}
