/**
 * A thread is done once the user cleared it out of their inbox. Threads that
 * were never in the inbox — ones holding only the user's own sent mail or
 * drafts — also have `inboxVisible === false`, so the inbound-message flag is
 * what separates the two: without it, a thread the user just sent reads as done
 * and offers "mark not done", which would file it into the inbox.
 */
export const isEmailThreadDone = (thread: {
  inboxVisible: boolean;
  hasInboundMessage: boolean;
}): boolean => !thread.inboxVisible && thread.hasInboundMessage;
