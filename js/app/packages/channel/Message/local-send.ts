import { createSignal } from 'solid-js';

/**
 * Tracks messages the local user just sent, keyed by optimistic id.
 *
 * The send handler calls `registerLocalSend` before firing the mutation and
 * `resolveLocalSend` when it settles. The message row consumes the entrance
 * animation once on first mount and renders as pending (grayed out) until
 * the send settles.
 *
 * Consuming the entrance removes the id, so a row animates at most once —
 * never again when the virtualized list remounts it on scroll, and never for
 * the replacement row created when the optimistic id is swapped for the
 * server id.
 */
const pendingEntranceIds = new Set<string>();

const [pendingSendIds, setPendingSendIds] = createSignal<ReadonlySet<string>>(
  new Set()
);

/** Register a send that was just fired. Call before mutating. */
export function registerLocalSend(id: string): void {
  pendingEntranceIds.add(id);
  setPendingSendIds((prev) => new Set(prev).add(id));
}

/** Mark a send as settled (success or failure). Call in onSettled. */
export function resolveLocalSend(id: string): void {
  setPendingSendIds((prev) => {
    if (!prev.has(id)) return prev;
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
}

/** Reactive: whether the message with this id has an unsettled send. */
export function isSendPending(id: string): boolean {
  return pendingSendIds().has(id);
}

export function consumeMessageEntrance(id: string): boolean {
  return pendingEntranceIds.delete(id);
}
