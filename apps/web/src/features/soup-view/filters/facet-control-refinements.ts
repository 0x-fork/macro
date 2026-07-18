import type { FacetSelection } from '@app/features/soup-list';
import type { SoupFacetControl } from './use-soup-facet-controls';

const sameIds = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) return false;
  const expected = new Set(right);
  return left.every((id) => expected.has(id));
};

export const facetControlResetValue = (
  control: SoupFacetControl,
  baseline: FacetSelection
) => (control.id === 'task_status' ? [] : (baseline[control.id] ?? []));

export const isFacetControlRefinement = (
  control: SoupFacetControl,
  baseline: FacetSelection
) => {
  const selected = control.activeIds();
  if (control.id === 'task_status') {
    return selected.length > 0 && selected.length < control.options().length;
  }
  return !sameIds(selected, baseline[control.id] ?? []);
};

export const clearFacetControlRefinements = (
  controls: readonly SoupFacetControl[],
  baseline: FacetSelection
) => {
  for (const control of controls) {
    control.onChange(facetControlResetValue(control, baseline));
  }
};
