import { TOKENS } from '@core/hotkey/tokens';
import { registerHotkey } from 'core/hotkey/hotkeys';

interface EmailHotkeyHandlers {
  blockSender: () => boolean;
  markDone: () => boolean;
  reply: () => boolean;
  replyAll: () => boolean;
  forward: () => boolean;
  markSenderSignal: () => boolean;
  markSenderNoise: () => boolean;
  navigateToPreviousMessage: () => boolean;
  navigateToNextMessage: () => boolean;
}

export function registerEmailHotkeys(
  scopeId: string,
  handlers: EmailHotkeyHandlers,
  options?: {
    /** Applied to every registration; gates dispatch and command-menu display. */
    condition?: () => boolean;
  }
) {
  const condition = options?.condition;
  registerHotkey({
    hotkey: 'r',
    scopeId: scopeId,
    condition,
    description: 'Reply to thread',
    keyDownHandler: handlers.reply,
    hotkeyToken: TOKENS.email.reply,
    displayPriority: 9,
  });
  // Reply-all's key is 'enter', handled by the email block's enter handler
  // (which first runs its expand/reply-to-focused steps); this unkeyed
  // registration keeps the action visible in the command menu.
  registerHotkey({
    scopeId: scopeId,
    condition,
    description: 'Reply all to thread',
    keyDownHandler: handlers.replyAll,
    hotkeyToken: TOKENS.email.replyAll,
    displayPriority: 8,
  });
  registerHotkey({
    hotkey: 'f',
    scopeId: scopeId,
    condition,
    description: 'Forward thread',
    keyDownHandler: handlers.forward,
    hotkeyToken: TOKENS.email.forward,
    displayPriority: 7,
  });
  registerHotkey({
    hotkey: 'e',
    scopeId,
    condition,
    description: 'Mark done',
    keyDownHandler: handlers.markDone,
    hotkeyToken: TOKENS.entity.action.markDone,
    displayPriority: 10,
  });
  registerHotkey({
    scopeId: scopeId,
    condition,
    description: 'Block sender',
    keyDownHandler: handlers.blockSender,
    hotkeyToken: TOKENS.email.blockSender,
    displayPriority: 5,
  });
  registerHotkey({
    scopeId: scopeId,
    condition,
    description: 'Mark sender as Signal',
    keyDownHandler: handlers.markSenderSignal,
    hotkeyToken: TOKENS.email.markSenderSignal,
    displayPriority: 5,
  });
  registerHotkey({
    scopeId: scopeId,
    condition,
    description: 'Mark sender as Noise',
    keyDownHandler: handlers.markSenderNoise,
    hotkeyToken: TOKENS.email.markSenderNoise,
    displayPriority: 5,
  });
  registerHotkey({
    hotkey: 'arrowup',
    scopeId,
    condition,
    description: 'Previous message',
    keyDownHandler: handlers.navigateToPreviousMessage,
    hotkeyToken: TOKENS.email.previousMessage,
  });
  registerHotkey({
    hotkey: 'arrowdown',
    scopeId,
    condition,
    description: 'Next message',
    keyDownHandler: handlers.navigateToNextMessage,
    hotkeyToken: TOKENS.email.nextMessage,
  });
}
