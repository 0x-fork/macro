/**
 * Tracks messages that should animate into the list because the local user
 * just sent them. The send handler registers the optimistic id before firing
 * the mutation; the message row consumes it when it first mounts.
 *
 * Consuming removes the id, so a row animates at most once — never again when
 * the virtualized list remounts it on scroll, and never for the replacement
 * row created when the optimistic id is swapped for the server id.
 */
const pendingEntranceIds = new Set<string>();

export function registerMessageEntrance(id: string): void {
  pendingEntranceIds.add(id);
}

export function consumeMessageEntrance(id: string): boolean {
  return pendingEntranceIds.delete(id);
}
