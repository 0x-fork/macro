import type { QueryKey } from '@tanstack/solid-query';
import { queryClient } from './client';

/**
 * Generic helper for patching TanStack Query cached data.
 * Prefer this for websocket events and optimistic UI to avoid invalidations/refetches.
 */
export function patchQueryData<T>(
  queryKey: QueryKey,
  updater: (prev: T | undefined) => T | undefined
) {
  queryClient.setQueryData<T>(queryKey, updater);
}

/**
 * Generic array upsert helper (replace by id if present, else append).
 */
export function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const index = list.findIndex((x) => x.id === item.id);
  if (index === -1) return [...list, item];
  const next = list.slice();
  next[index] = item;
  return next;
}


