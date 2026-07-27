import type { SearchableOption } from '@app/features/soup/view/components/searchable-multi-select';
import { type Accessor, createMemo, type JSX } from 'solid-js';
import {
  type SoupFacetControl,
  useSoupFacetControls,
} from '../../filters/use-soup-facet-controls';

export type SearchFacetOption = {
  id: string;
  label: string;
  icon?: () => JSX.Element;
};

export type SearchFacetMode = {
  value: Accessor<'any' | 'all'>;
  onSelect: (mode: 'any' | 'all') => void;
  visible: Accessor<boolean>;
};

type SearchFacetBase = {
  id: string;
  label: string;
  values: Accessor<SearchFacetOption[]>;
  isDefault: Accessor<boolean>;
  reset: () => void;
};

export type SearchFacet = SearchFacetBase &
  (
    | {
        kind: 'single';
        options: SearchFacetOption[];
        selectedId: Accessor<string>;
        onSelect: (id: string) => void;
      }
    | {
        kind: 'multi';
        options: Accessor<SearchableOption[]>;
        activeIds: Accessor<string[]>;
        onChange: (ids: string[]) => void;
        placeholder: string;
        preserveOrder?: boolean;
        onOnly: (id: string) => void;
        mode?: SearchFacetMode;
      }
  );

const optionValues = (control: SoupFacetControl) => () => {
  if (control.displayValues) return control.displayValues();
  const ids = control.activeIds();
  if (ids.length === 0) {
    return [{ id: 'all', label: control.neutralLabel ?? 'All' }];
  }
  const options = control.options();
  return ids.map((id) => {
    const option = options.find((candidate) => candidate.id === id);
    return option ?? { id, label: id };
  });
};

const singleFacet = (control: SoupFacetControl): SearchFacet => {
  const neutral = { id: 'all', label: control.neutralLabel ?? 'All' };
  return {
    kind: 'single',
    id: control.id,
    label: control.label,
    options: [neutral, ...control.options()],
    selectedId: () => control.activeIds()[0] ?? 'all',
    onSelect: (id) => control.onChange(id === 'all' ? [] : [id]),
    values: optionValues(control),
    isDefault: control.isDefault ?? (() => control.activeIds().length === 0),
    reset: control.reset ?? (() => control.onChange([])),
  };
};

const multiFacet = (
  control: SoupFacetControl,
  modeControl?: SoupFacetControl
): SearchFacet => ({
  kind: 'multi',
  id: control.id,
  label: control.label,
  options: control.options,
  activeIds: control.activeIds,
  onChange: control.onChange,
  onOnly: control.onOnly ?? ((id) => control.onChange([id])),
  placeholder:
    control.placeholder ?? `Search ${control.label.toLowerCase()}...`,
  preserveOrder: control.preserveOrder,
  values: optionValues(control),
  isDefault: control.isDefault ?? (() => control.activeIds().length === 0),
  reset: () => {
    (control.reset ?? (() => control.onChange([])))();
    if (control.id === 'tag') modeControl?.onChange([]);
  },
  mode:
    control.id === 'tag' && modeControl
      ? {
          value: () =>
            modeControl.activeIds().includes('all') ? 'all' : 'any',
          onSelect: (mode) =>
            modeControl.onChange(mode === 'all' ? ['all'] : []),
          visible: () => control.activeIds().length >= 2,
        }
      : undefined,
});

export function useSearchFacets(): Accessor<SearchFacet[]> {
  const controls = useSoupFacetControls();
  return createMemo(() => {
    const available = controls();
    const modeControl = available.find((control) => control.id === 'tag_mode');
    return available
      .filter((control) => control.id !== 'tag_mode')
      .map((control) =>
        control.multiple
          ? multiFacet(control, modeControl)
          : singleFacet(control)
      );
  });
}
