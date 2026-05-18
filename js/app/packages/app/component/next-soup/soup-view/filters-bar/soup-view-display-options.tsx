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
import {
  DEFAULT_GROUP_OPTIONS,
  EMAIL_GROUP_OPTIONS,
  type GroupOption,
  type GroupOptionId,
  INBOX_GROUP_OPTIONS,
  TASK_GROUP_OPTIONS,
} from '@app/component/next-soup/soup-view/group-options';
import { useSoupView } from '@app/component/next-soup/soup-view/soup-view-context';
import { createMemo } from 'solid-js';

const VIEW_SORT_OPTIONS: Partial<Record<ListView, SortOption[]>> = {
  mail: EMAIL_SORT_OPTIONS,
  documents: DOCUMENT_SORT_OPTIONS,
  tasks: TASK_SORT_OPTIONS,
  channels: CHANNEL_SORT_OPTIONS,
};

const VIEW_GROUP_OPTIONS: Partial<Record<ListView, GroupOption[]>> = {
  tasks: TASK_GROUP_OPTIONS,
  mail: EMAIL_GROUP_OPTIONS,
  inbox: INBOX_GROUP_OPTIONS,
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

  const groupOptions = createMemo(() => {
    const view = component();
    if (!view) return DEFAULT_GROUP_OPTIONS;
    return VIEW_GROUP_OPTIONS[view] ?? DEFAULT_GROUP_OPTIONS;
  });

  const groupValue = createMemo(
    (): GroupOptionId =>
      (soup.grouping.activeGroupId() as GroupOptionId) ?? 'none'
  );

  const onGroupChange = (groupOption: GroupOptionId) => {
    if (groupOption === 'none') {
      soup.grouping.setActiveGroupId(undefined);
    } else {
      soup.grouping.setActiveGroupId(groupOption);
      soup.grouping.expandAll();
    }
  };

  return (
    <DisplayOptionsDropdown
      sortValue={sortValue}
      onSortChange={onSortChange}
      sortOptions={sortOptions()}
      groupValue={groupValue}
      onGroupChange={onGroupChange}
      groupOptions={groupOptions()}
    />
  );
};
