import type { ListView } from '@app/constants/list-views';
import {
  COMPANY_GROUP_OPTIONS,
  type GroupOption,
  TASK_GROUP_OPTIONS,
} from '@app/features/soup/view/components/group-options';
import {
  CHANNEL_SORT_OPTIONS,
  DEFAULT_SORT_OPTIONS,
  DOCUMENT_SORT_OPTIONS,
  EMAIL_SORT_OPTIONS,
  type SortOption,
  TASK_SORT_OPTIONS,
} from '@app/features/soup/view/components/sort-options';
import type { SoupViewMode } from '../context';

export const COMPANY_MODE_TABS: Array<{
  value: SoupViewMode;
  label: string;
}> = [
  { value: 'board', label: 'Board' },
  { value: 'list', label: 'List' },
];

export const soupSortOptions = (view: ListView): SortOption[] => {
  if (view === 'tasks') return TASK_SORT_OPTIONS;
  if (view === 'mail') return EMAIL_SORT_OPTIONS;
  if (view === 'documents') return DOCUMENT_SORT_OPTIONS;
  if (view === 'channels') return CHANNEL_SORT_OPTIONS;
  return DEFAULT_SORT_OPTIONS;
};

export const soupGroupOptions = (view: ListView): GroupOption[] => {
  if (view === 'tasks') return TASK_GROUP_OPTIONS;
  if (view === 'companies') return COMPANY_GROUP_OPTIONS;
  return [];
};
