import type { ListView } from '@app/constants/list-views';
import type { SystemSortOption } from '@app/features/soup/collection/sort-config';
import ArrowClockwiseIcon from '@phosphor/arrow-clockwise.svg';
import ClockIcon from '@phosphor/clock.svg';
import EyeIcon from '@phosphor/eye.svg';
import FlagIcon from '@phosphor/flag.svg';
import ListChecksIcon from '@phosphor/list-checks.svg';
import type { JSX } from 'solid-js';

export type { SystemSortOption } from '@app/features/soup/collection/sort-config';

export interface SortOption {
  value: SystemSortOption;
  label: string;
  icon?: () => JSX.Element;
}

const SORT_OPTIONS = [
  {
    value: 'viewed_at',
    label: 'Last viewed',
    icon: () => <EyeIcon class="size-3.5" />,
  },
  {
    value: 'updated_at',
    label: 'Last updated',
    icon: () => <ArrowClockwiseIcon class="size-3.5" />,
  },
  {
    value: 'created_at',
    label: 'Date created',
    icon: () => <ClockIcon class="size-3.5" />,
  },
  {
    value: 'priority',
    label: 'Priority',
    icon: () => <FlagIcon class="size-3.5" />,
  },
  {
    value: 'status',
    label: 'Status',
    icon: () => <ListChecksIcon class="size-3.5" />,
  },
] as const satisfies SortOption[];

type OptionValue = (typeof SORT_OPTIONS)[number]['value'];

const buildSortOptions = (options: OptionValue[]) =>
  SORT_OPTIONS.filter((option) => options.includes(option.value));

export const DEFAULT_SORT_OPTIONS = buildSortOptions([
  'viewed_at',
  'updated_at',
  'created_at',
]);

export const TASK_SORT_OPTIONS = buildSortOptions([
  'viewed_at',
  'updated_at',
  'created_at',
  'status',
  'priority',
]);

export const DOCUMENT_SORT_OPTIONS = buildSortOptions([
  'viewed_at',
  'updated_at',
  'created_at',
]);

export const EMAIL_SORT_OPTIONS = buildSortOptions([
  'viewed_at',
  'updated_at',
  'created_at',
]);

export const CHANNEL_SORT_OPTIONS = buildSortOptions([
  'viewed_at',
  'updated_at',
  'created_at',
]);

export const soupSortOptions = (view: ListView): SortOption[] => {
  if (view === 'tasks') return TASK_SORT_OPTIONS;
  if (view === 'mail') return EMAIL_SORT_OPTIONS;
  if (view === 'documents') return DOCUMENT_SORT_OPTIONS;
  if (view === 'channels') return CHANNEL_SORT_OPTIONS;
  return DEFAULT_SORT_OPTIONS;
};
