import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import type { ListView } from '@app/constants/list-views';
import { DisplayOptionsDropdown } from './display-options-dropdown';
import {
  CHANNEL_SORT_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  EMAIL_SORT_OPTIONS,
  TASK_SORT_OPTIONS,
  type SortOption,
  type SystemSortOption,
} from '@app/component/next-soup/soup-view/sort-options';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { createMemo } from 'solid-js';

const VIEW_SORT_OPTIONS: Partial<Record<ListView, SortOption[]>> = {
  mail: EMAIL_SORT_OPTIONS,
  documents: DOCUMENT_SORT_OPTIONS,
  tasks: TASK_SORT_OPTIONS,
  channels: CHANNEL_SORT_OPTIONS,
};

export const SoupViewDisplayOptions = () => {
  const panel = useSplitPanelOrThrow();
  const { soup } = useSoupView();

  const component = createMemo(() => {
    const content = panel.handle.content();
    if (content.type !== 'component') return;
    return content.id as ListView;
  });

  const sortOptions = createMemo(() => {
    const view = component();
    if (!view) return DEFAULT_SORT_OPTIONS;
    return VIEW_SORT_OPTIONS[view] ?? DEFAULT_SORT_OPTIONS;
  });

  const sortValue = createMemo(
    () => (soup.sort.active()[0]?.id as SystemSortOption) ?? 'updated_at'
  );

  const onSortChange = (sortOption: SystemSortOption) => {
    soup.sort.setAll([sortOption]);
  };

  return (
    <DisplayOptionsDropdown
      sortValue={sortValue}
      onSortChange={onSortChange}
      sortOptions={sortOptions()}
    />
  );
};
