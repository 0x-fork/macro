import { createBlockSignal } from '@core/block';
import { useSearchParams } from '@solidjs/router';

/** stores the id of the thread currently being viewed */
export const activeThreadIdSignal = createBlockSignal<string>();

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
