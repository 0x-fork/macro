import type {
  FacetSelection,
  SoupCollection,
} from '@app/features/soup/collection';

export const REFINEMENT_FACET_IDS = [
  'entity_type',
  'status',
  'attachment',
  'calendar',
  'type',
  'task_status',
  'task_priority',
  'assignee',
  'company_stage',
  'company_owner',
  'tag',
  'tag_mode',
  'search_type',
  'email_importance',
  'email_inbox',
  'channel_in',
  'channel_from',
  'call_in',
  'call_from',
  'call_status',
  'task_created_by',
] as const;

const sameIds = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((id) => expected.has(id));
};

export function hasFacetRefinements(
  collection: Pick<SoupCollection, 'facets'>,
  baseline: FacetSelection
): boolean {
  return REFINEMENT_FACET_IDS.some((id) => {
    const selected = collection.facets.getSelected(id);
    if (id === 'task_status') {
      return selected.length > 0 && selected.length < 5;
    }
    return !sameIds(selected, baseline[id] ?? []);
  });
}

export function clearFacetRefinements(
  collection: Pick<SoupCollection, 'facets'>,
  baseline: FacetSelection
) {
  for (const id of REFINEMENT_FACET_IDS) {
    collection.facets.set(id, id === 'task_status' ? [] : (baseline[id] ?? []));
  }
}
