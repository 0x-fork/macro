import { hashKey, type QueryKey } from '@tanstack/query-core';

const persistedSoupViewHashes = new Set<string>();

/**
 * Marks a soup items query as a sidebar default-tab query that should be
 * persisted to IDB (first page only) and restored on the next mount.
 *
 * Soup query keys embed compiled filter ASTs and user context, so the set
 * of persistable keys cannot be derived statically by the persistence
 * layer. Instead the view layer registers the key before the query mounts
 * — `hashKey` matching makes registration order-insensitive for object
 * properties, mirroring how the query cache hashes keys.
 */
export function registerPersistedSoupViewQuery(queryKey: QueryKey): void {
  persistedSoupViewHashes.add(hashKey(queryKey));
}

/** True if the key was registered as a persisted sidebar default-tab query. */
export function isPersistedSoupViewQuery(queryKey: QueryKey): boolean {
  return persistedSoupViewHashes.has(hashKey(queryKey));
}
