import { createBlockSignal, createBlockStore } from '@core/block';
import type {
  MessageWithThreadId,
  ThreadStoreData,
} from '@queries/channel/selectors';
import { useSearchParams } from '@solidjs/router';

/** stores all of the threads in the channel parent_message_id -> messages */
export const threadsStore = createBlockStore<ThreadStoreData>({});
/** stores the id of the thread currently being viewed */
export const activeThreadIdSignal = createBlockSignal<string>();

/** Updates a message in a thread
 * if the message is not in a thread, it will be added */
export function upsertInThread(message: MessageWithThreadId) {
  const threadId = message.thread_id;
  const [threads, setThreads] = threadsStore;

  const thread = threads[threadId] ?? [];
  const index = thread.findIndex((m) => m.id === message.id);

  if (thread && index !== -1) {
    setThreads(threadId, index, message);
  } else {
    setThreads(threadId, (prev) => {
      if (!prev) {
        return [message];
      }
      return [...prev, message];
    });
  }
}

/** Toggle the active thread by id
 * if the thread is already active, it will be closed */
export function toggleThread(threadId?: string) {
  const [, setSearchParams] = useSearchParams();
  const [activeThreadId, setActiveThreadId] = activeThreadIdSignal;

  if (activeThreadId() === threadId) {
    setActiveThreadId(undefined);
    setSearchParams({ thread_id: undefined });
  } else {
    setActiveThreadId(threadId);
    setSearchParams({ thread_id: threadId });
  }
}
