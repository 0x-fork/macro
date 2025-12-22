import type { Message } from '@service-comms/generated/models/message';

export type ThreadId = NonNullable<Message['thread_id']>;
export type MessageWithThreadId = Message & { thread_id: ThreadId };
export type ThreadsById = Record<string, MessageWithThreadId[]>;
export type ThreadStoreData = ThreadsById;

export type GroupedChannelMessages = {
  /** Messages that are not part of a thread (no `thread_id`). */
  topLevel: Message[];
  /** Thread replies grouped by `thread_id`. */
  threadsById: ThreadsById;
};

/**
 * Groups channel messages into:
 * - top-level messages (no thread_id)
 * - thread replies grouped by thread_id
 *
 * Note: This does not attempt to sort messages. It preserves the input order within each group.
 */
export function groupChannelMessages(messages: Message[]): GroupedChannelMessages {
  const topLevel: Message[] = [];
  const threadsById: ThreadsById = {};

  for (const m of messages) {
    const threadId = m.thread_id;
    if (!threadId) {
      topLevel.push(m);
      continue;
    }
    const arr = threadsById[threadId] ?? (threadsById[threadId] = []);
    arr.push({ ...m, thread_id: threadId });
  }

  return { topLevel, threadsById };
}


