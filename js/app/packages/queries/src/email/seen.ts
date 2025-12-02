import { threadSeen } from './client';

const DEBOUNCE_MS = 1500;

// Track pending seen calls per thread
const pendingSeenCalls = new Map<
  string,
  { timer: ReturnType<typeof setTimeout>; abortController: AbortController }
>();

/**
 * Mark a thread as seen with debouncing.
 * If called multiple times for the same thread within DEBOUNCE_MS,
 * only the last call will actually fire.
 * If called for different threads in quick succession, each will fire
 * after DEBOUNCE_MS from its last call.
 */
export function debouncedThreadSeen(
  threadId: string,
  signal?: AbortSignal
): void {
  // If there's already a pending call for this thread, cancel it
  const existing = pendingSeenCalls.get(threadId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.abortController.abort();
  }

  // If external signal is already aborted, don't schedule
  if (signal?.aborted) return;

  const abortController = new AbortController();

  // Link external abort signal to our controller
  if (signal) {
    signal.addEventListener('abort', () => {
      const pending = pendingSeenCalls.get(threadId);
      if (pending) {
        clearTimeout(pending.timer);
        pending.abortController.abort();
        pendingSeenCalls.delete(threadId);
      }
    });
  }

  const timer = setTimeout(() => {
    pendingSeenCalls.delete(threadId);

    // Don't call if aborted
    if (abortController.signal.aborted) return;

    threadSeen({
      path: { id: threadId },
      signal: abortController.signal,
    }).catch(() => {
      // Silently ignore errors for debounced seen calls
    });
  }, DEBOUNCE_MS);

  pendingSeenCalls.set(threadId, { timer, abortController });
}

/**
 * Immediately mark a thread as seen without debouncing.
 * Use this when you need immediate feedback (e.g., explicit user action).
 */
export async function immediateThreadSeen(
  threadId: string,
  signal?: AbortSignal
): Promise<{ error?: unknown }> {
  // Cancel any pending debounced call for this thread
  const existing = pendingSeenCalls.get(threadId);
  if (existing) {
    clearTimeout(existing.timer);
    existing.abortController.abort();
    pendingSeenCalls.delete(threadId);
  }

  return threadSeen({
    path: { id: threadId },
    signal,
  });
}

/**
 * Cancel all pending seen calls.
 * Useful for cleanup on unmount.
 */
export function cancelAllPendingSeenCalls(): void {
  for (const [threadId, { timer, abortController }] of pendingSeenCalls) {
    clearTimeout(timer);
    abortController.abort();
    pendingSeenCalls.delete(threadId);
  }
}
