import { TOKENS } from '@core/hotkey/tokens';
import { createHotkeyGroup, registerHotkey } from 'core/hotkey/hotkeys';

interface EmailHotkeyHandlers {
  blockSender: () => boolean;
  markDone: () => boolean;
  markSenderSignal: () => boolean;
  markSenderNoise: () => boolean;
  navigateToPreviousMessage: () => boolean;
  navigateToNextMessage: () => boolean;
}

interface ReplyHotkeyHandlers {
  reply: () => boolean;
  replyAll: () => boolean;
  forward: () => boolean;
}

/**
 * Registers the Superhuman-style reply/forward shortcuts (`r`, `shift+r`, `f`)
 * for an email thread. Returns a hotkey group so the caller can dispose the
 * registrations when the email block unmounts.
 *
 * These live separately from {@link registerEmailHotkeys} because their
 * handlers need access to the email form registry, which is only available
 * deeper in the component tree.
 */
export function registerReplyHotkeys(
  scopeId: string,
  handlers: ReplyHotkeyHandlers
) {
  const group = createHotkeyGroup();
  group.add(
    registerHotkey({
      hotkey: 'r',
      scopeId,
      description: 'Reply',
      keyDownHandler: handlers.reply,
      hotkeyToken: TOKENS.email.reply,
      displayPriority: 9,
    })
  );
  group.add(
    registerHotkey({
      hotkey: 'shift+r',
      scopeId,
      description: 'Reply all',
      keyDownHandler: handlers.replyAll,
      hotkeyToken: TOKENS.email.replyAll,
      displayPriority: 8,
    })
  );
  group.add(
    registerHotkey({
      hotkey: 'f',
      scopeId,
      description: 'Forward',
      keyDownHandler: handlers.forward,
      hotkeyToken: TOKENS.email.forward,
      displayPriority: 7,
    })
  );
  return group;
}

export function registerEmailHotkeys(
  scopeId: string,
  handlers: EmailHotkeyHandlers
) {
  registerHotkey({
    hotkey: 'e',
    scopeId,
    description: 'Mark done',
    keyDownHandler: handlers.markDone,
    hotkeyToken: TOKENS.entity.action.markDone,
    displayPriority: 10,
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
