import { TOKENS } from '@core/hotkey/tokens';
import { registerHotkey } from 'core/hotkey/hotkeys';

interface EmailHotkeyHandlers {
  blockSender: () => boolean;
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
  handlers: EmailHotkeyHandlers
) {
  // 'e' (mark done) is deliberately NOT registered here: the block-scope
  // registration in use-block-entity-commands owns it, running the single
  // optimistic mark-done path. A second registration here would override
  // it with a duplicate archive round trip.
  registerHotkey({
    hotkey: 'r',
    scopeId: scopeId,
    description: 'Reply to thread',
    keyDownHandler: handlers.reply,
    hotkeyToken: TOKENS.email.reply,
    displayPriority: 9,
  });
  // Reply-all's key is 'enter', handled by the email block's enter handler
  // (which also expands collapsed messages); this unkeyed registration
  // keeps the action visible in the command menu.
  registerHotkey({
    scopeId: scopeId,
    description: 'Reply all to thread',
    keyDownHandler: handlers.replyAll,
    hotkeyToken: TOKENS.email.replyAll,
    displayPriority: 8,
  });
  registerHotkey({
    hotkey: 'f',
    scopeId: scopeId,
    description: 'Forward thread',
    keyDownHandler: handlers.forward,
    hotkeyToken: TOKENS.email.forward,
    displayPriority: 7,
  });
  registerHotkey({
    scopeId: scopeId,
    description: 'Block sender',
    keyDownHandler: handlers.blockSender,
    hotkeyToken: TOKENS.email.blockSender,
    displayPriority: 5,
  });
  registerHotkey({
    scopeId: scopeId,
    description: 'Mark sender as Signal',
    keyDownHandler: handlers.markSenderSignal,
    hotkeyToken: TOKENS.email.markSenderSignal,
    displayPriority: 5,
  });
  registerHotkey({
    scopeId: scopeId,
    description: 'Mark sender as Noise',
    keyDownHandler: handlers.markSenderNoise,
    hotkeyToken: TOKENS.email.markSenderNoise,
    displayPriority: 5,
  });
  registerHotkey({
    hotkey: 'arrowup',
    scopeId,
    description: 'Previous message',
    keyDownHandler: handlers.navigateToPreviousMessage,
    hotkeyToken: TOKENS.email.previousMessage,
  });
  registerHotkey({
    hotkey: 'arrowdown',
    scopeId,
    description: 'Next message',
    keyDownHandler: handlers.navigateToNextMessage,
    hotkeyToken: TOKENS.email.nextMessage,
  });
}
