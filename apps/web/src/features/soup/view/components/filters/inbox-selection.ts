import { NIL_UUID } from '@app/features/soup/filters/facet-store';

export const isNoInboxesSelection = (selected: readonly string[]) =>
  selected.includes(NIL_UUID);

export const inboxActiveIds = (
  selected: readonly string[],
  allIds: readonly string[]
): string[] => {
  if (isNoInboxesSelection(selected)) return [];
  return selected.length > 0 ? [...selected] : [...allIds];
};

export const encodeInboxSelection = (
  activeIds: readonly string[],
  allIds: readonly string[]
): string[] => {
  if (activeIds.length === 0) return [NIL_UUID];
  if (
    activeIds.length === allIds.length &&
    allIds.every((id) => activeIds.includes(id))
  ) {
    return [];
  }
  return [...activeIds];
};

export const selectOnlyInbox = (
  id: string,
  selected: readonly string[],
  allIds: readonly string[]
): string[] => {
  const active = inboxActiveIds(selected, allIds);
  return active.length === 1 && active[0] === id ? [] : [id];
};
