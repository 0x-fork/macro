import { debouncedThreadSeen } from '@queries';

/**
 * Mark a thread as seen with debouncing.
 * When scrolling through a list quickly, calls are debounced to reduce API load.
 */
export function markThreadAsSeen(threadId: string, signal?: AbortSignal): void {
  debouncedThreadSeen(threadId, signal);
}
