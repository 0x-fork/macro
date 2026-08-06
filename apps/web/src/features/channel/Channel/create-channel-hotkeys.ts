import { registerHotkey, useHotkeyDOMScope } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import type { ApiChannelMessage } from '@service-storage/generated/schemas/apiChannelMessage';
import type { Accessor } from 'solid-js';
import type { MessageActions, MessageData } from '../Message';
import { isBotMessage } from '../Thread/utils/message-actions';
import type { MessageSelection } from './create-message-selection';
import type { ThreadListNavigation } from './ThreadList';

type CreateChannelHotkeysOptions = {
  selection: MessageSelection;
  navigation: Accessor<ThreadListNavigation | undefined>;
  messageById: Accessor<Map<string, ApiChannelMessage>>;
  getMessageActions: (message: MessageData) => MessageActions | undefined;
  userId: Accessor<string | undefined>;
  isInputEmpty: Accessor<boolean>;
  isEditing: Accessor<boolean>;
  onOpenFindBar: () => void;
  onGoToBottom: () => void;
  onKeyboardNavigate?: () => void;
};

export function canReplyToSelectedMessageFromHotkey(input: {
  hasSelection: boolean;
  isEditing: boolean;
}) {
  return input.hasSelection && !input.isEditing;
}
export function canEditSelectedMessageFromHotkey(input: {
  hasSelection: boolean;
  isEditing: boolean;
  isOwnMessage: boolean;
}) {
  return canReplyToSelectedMessageFromHotkey(input) && input.isOwnMessage;
}
export function canDeleteSelectedMessageFromHotkey(input: {
  hasSelection: boolean;
  isEditing: boolean;
  isOwnMessage: boolean;
  isBotMessage: boolean;
}) {
  return (
    canReplyToSelectedMessageFromHotkey(input) &&
    (input.isOwnMessage || input.isBotMessage)
  );
}

export function createChannelHotkeys(options: CreateChannelHotkeysOptions) {
  const [attachMessageList, messageListScope] =
    useHotkeyDOMScope('channel-messages');
  const [attachInput, inputScope] = useHotkeyDOMScope('channel-input');

  let messageListEl: HTMLElement | undefined;
  let inputEl: HTMLElement | undefined;

  const hasSelection = () => !!options.selection.selectedId();
  const canRunSelectionActionHotkeys = () =>
    canReplyToSelectedMessageFromHotkey({
      hasSelection: hasSelection(),
      isEditing: options.isEditing(),
    });

  const getSelectedMessage = () => {
    const id = options.selection.selectedId();
    if (!id) return undefined;
    return options.messageById().get(id);
  };

  const getSelectedMessageActionButtons = () => {
    const id = options.selection.selectedId();
    if (!id || !messageListEl) return [];
    const message = Array.from(
      messageListEl.querySelectorAll<HTMLElement>('[data-message]')
    ).find((element) => element.dataset.messageId === id);
    if (!message) return [];
    return Array.from(
      message.querySelectorAll<HTMLButtonElement>('button[data-message-action]')
    ).filter((button) => !button.disabled);
  };

  const focusSelectedMessageAction = (direction: -1 | 1) => {
    const buttons = getSelectedMessageActionButtons();
    if (buttons.length === 0) return false;

    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement
    );
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, currentIndex + direction));
    buttons[nextIndex]?.focus();
    return true;
  };

  const isSelectedMessageActionFocused = () =>
    getSelectedMessageActionButtons().some(
      (button) => button === document.activeElement
    );

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'arrowup',
    hotkeyToken: TOKENS.channel.focusPreviousMessage,
    description: 'Previous message',
    keyDownHandler: () => {
      options.onKeyboardNavigate?.();
      const id = options.selection.selectPrevious();
      if (id) {
        options.navigation()?.markUserIntent('up');
        options.navigation()?.scrollToId(id, { align: 'nearest' });
      }
      return true;
    },
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'arrowdown',
    hotkeyToken: TOKENS.channel.focusNextMessage,
    description: 'Next message',
    keyDownHandler: () => {
      options.onKeyboardNavigate?.();
      const id = options.selection.selectNext();
      if (id) {
        options.navigation()?.markUserIntent('down');
        options.navigation()?.scrollToId(id, { align: 'nearest' });
      } else {
        inputEl?.querySelector<HTMLElement>('[contenteditable]')?.focus();
      }
      return true;
    },
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'arrowright',
    description: 'Next message action',
    handlerPriority: 4,
    condition: hasSelection,
    keyDownHandler: () => {
      options.onKeyboardNavigate?.();
      return focusSelectedMessageAction(1);
    },
    hide: true,
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'enter',
    description: 'Run focused message action',
    handlerPriority: 4,
    registrationType: 'add',
    condition: isSelectedMessageActionFocused,
    keyDownHandler: () => {
      (document.activeElement as HTMLButtonElement | null)?.click();
      return true;
    },
    hide: true,
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'arrowleft',
    description: 'Previous message action',
    handlerPriority: 4,
    condition: hasSelection,
    keyDownHandler: () => {
      options.onKeyboardNavigate?.();
      return focusSelectedMessageAction(-1);
    },
    hide: true,
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'shift+g',
    description: 'Go to latest message',
    keyDownHandler: () => {
      options.selection.clear();
      options.navigation()?.markUserIntent('down');
      options.onGoToBottom();
      return true;
    },
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'enter',
    hotkeyToken: TOKENS.channel.replyToMessage,
    description: 'Reply to message',
    registrationType: 'add',
    condition: canRunSelectionActionHotkeys,
    keyDownHandler: () => {
      const msg = getSelectedMessage();
      if (!msg) return false;
      const actions = options.getMessageActions(msg);
      actions?.onReply?.({ message: msg });
      return true;
    },
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'e',
    hotkeyToken: TOKENS.channel.editMessage,
    description: 'Edit message',
    condition: () => {
      if (!canRunSelectionActionHotkeys()) return false;
      const msg = getSelectedMessage();
      return canEditSelectedMessageFromHotkey({
        hasSelection: true,
        isEditing: options.isEditing(),
        isOwnMessage: !!msg && msg.sender_id === options.userId(),
      });
    },
    keyDownHandler: () => {
      const msg = getSelectedMessage();
      if (!msg) return false;
      const actions = options.getMessageActions(msg);
      actions?.onEdit?.({ message: msg });
      return true;
    },
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'backspace',
    hotkeyToken: TOKENS.channel.deleteMessage,
    description: 'Delete message',
    condition: () => {
      if (!canRunSelectionActionHotkeys()) return false;
      const msg = getSelectedMessage();
      return canDeleteSelectedMessageFromHotkey({
        hasSelection: true,
        isEditing: options.isEditing(),
        isOwnMessage: !!msg && msg.sender_id === options.userId(),
        isBotMessage: !!msg && isBotMessage(msg),
      });
    },
    keyDownHandler: () => {
      const msg = getSelectedMessage();
      if (!msg) return false;
      const actions = options.getMessageActions(msg);
      actions?.onDelete?.({ message: msg });
      return true;
    },
  });

  registerHotkey({
    scopeId: messageListScope,
    hotkey: 'escape',
    hotkeyToken: TOKENS.channel.clearSelection,
    description: 'Clear selection',
    condition: hasSelection,
    keyDownHandler: () => {
      options.selection.clear();
      return true;
    },
  });

  registerHotkey({
    scopeId: inputScope,
    hotkey: 'arrowup',
    hotkeyToken: TOKENS.channel.focusPreviousMessage,
    description: 'Select last message',
    runWithInputFocused: true,
    condition: options.isInputEmpty,
    keyDownHandler: () => {
      const id = options.selection.selectPrevious();
      if (id) {
        options.navigation()?.markUserIntent('up');
        options.navigation()?.scrollToId(id, { align: 'nearest' });
        messageListEl?.focus();
      }
      return true;
    },
  });

  for (const scopeId of [messageListScope, inputScope]) {
    registerHotkey({
      scopeId,
      hotkey: 'cmd+f',
      hotkeyToken: TOKENS.channel.findInChannel,
      description: 'Find in channel',
      runWithInputFocused: true,
      keyDownHandler: () => {
        options.onOpenFindBar();
        return true;
      },
    });
  }

  return {
    messageListScopeId: messageListScope,
    focusMessageList: () => messageListEl?.focus(),
    attachMessageListRef: (el: HTMLElement) => {
      messageListEl = el;
      attachMessageList(el);
    },
    attachInputRef: (el: HTMLElement) => {
      inputEl = el;
      attachInput(el);
    },
  };
}
