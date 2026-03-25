import type { ApiMessage } from '@service-email/generated/schemas';

/**
 * Scrolls to a message by its ID within a messages container
 * @param messageId - The db_id of the message to scroll to
 * @param messages - Array of messages in the current thread
 * @param messagesContainer - The DOM container holding the message elements
 * @param behavior - Scroll behavior ('smooth' | 'instant' | 'auto')
 * @returns true if message was found and scrolled to, false otherwise
 */
export function scrollToMessage(
  messageId: string,
  messages: ApiMessage[],
  messagesContainer: HTMLElement,
  {
    behavior = 'smooth',
    reversed = false,
  }: { behavior?: ScrollBehavior; reversed?: boolean }
): boolean {
  let messageIndex = messages.findIndex((m) => m.db_id === messageId);

  if (reversed) {
    messageIndex = messages.length - 1 - messageIndex;
  }

  if (messageIndex < 0) {
    return false;
  }

  const targetElement = messagesContainer.children[messageIndex];

  if (!targetElement) {
    return false;
  }

  targetElement.scrollIntoView({
    behavior,
    block: 'start',
  });

  return true;
}
