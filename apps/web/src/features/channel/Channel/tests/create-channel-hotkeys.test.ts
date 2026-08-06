import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import { createChannelHotkeys } from '../create-channel-hotkeys';

afterEach(() => {
  document.body.replaceChildren();
});

describe('createChannelHotkeys', () => {
  it('focuses the message-list scope on request', () => {
    const messageList = document.createElement('div');
    messageList.tabIndex = -1;
    document.body.append(messageList);

    createRoot((dispose) => {
      const hotkeys = createChannelHotkeys({
        selection: {
          selectedId: () => undefined,
          select: () => {},
          clear: () => {},
          selectFirst: () => undefined,
          selectPrevious: () => undefined,
          selectNext: () => undefined,
        },
        navigation: () => undefined,
        messageById: () => new Map(),
        getMessageActions: () => undefined,
        userId: () => undefined,
        isInputEmpty: () => true,
        isEditing: () => false,
        onOpenFindBar: () => {},
        onGoToBottom: () => {},
      });

      hotkeys.attachMessageListRef(messageList);
      hotkeys.focusMessageList();

      expect(document.activeElement).toBe(messageList);
      dispose();
    });
  });
});
