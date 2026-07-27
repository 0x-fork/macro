import { compareDateDesc } from '@core/util/date';
import type { EntityData, TaskEntityWithProperties } from '@entity';
import {
  getTaskPriorityOptionId,
  getTaskStatusOptionId,
} from '@entity/utils/task-properties';
import { PROPERTY_OPTION_IDS } from '@property/constants';

export type SystemSortOption =
  | 'updated_at'
  | 'created_at'
  | 'viewed_at'
  | 'priority'
  | 'status';

export type SortConfig<T, TId extends string = string> = {
  id: TId;
  fn: (a: T, b: T) => number;
  desc?: boolean;
  reversed?: boolean;
};

const sortByCreatedAt = (a: EntityData, b: EntityData) =>
  compareDateDesc(a.sortTs ?? a.createdAt, b.sortTs ?? b.createdAt);

const sortByUpdatedAt = (a: EntityData, b: EntityData) =>
  compareDateDesc(a.sortTs ?? a.updatedAt, b.sortTs ?? b.updatedAt);

const sortByViewedAt = (a: EntityData, b: EntityData) =>
  compareDateDesc(a.sortTs ?? a.viewedAt, b.sortTs ?? b.viewedAt);

const PRIORITY_ORDER: Record<string, number> = {
  [PROPERTY_OPTION_IDS.PRIORITY.URGENT]: 0,
  [PROPERTY_OPTION_IDS.PRIORITY.HIGH]: 1,
  [PROPERTY_OPTION_IDS.PRIORITY.MEDIUM]: 2,
  [PROPERTY_OPTION_IDS.PRIORITY.LOW]: 3,
};
const NO_PRIORITY_ORDER = 4;

const getPriorityOrder = (priority: string | undefined) =>
  priority
    ? (PRIORITY_ORDER[priority] ?? NO_PRIORITY_ORDER)
    : NO_PRIORITY_ORDER;

const STATUS_ORDER: Record<string, number> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 0,
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 1,
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 2,
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 3,
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 4,
};
const NO_STATUS_ORDER = 5;

const getStatusOrder = (status: string | undefined) =>
  status ? (STATUS_ORDER[status] ?? NO_STATUS_ORDER) : NO_STATUS_ORDER;

const sortByPriority = (a: EntityData, b: EntityData) => {
  const difference =
    getPriorityOrder(getTaskPriorityOptionId(a as TaskEntityWithProperties)) -
    getPriorityOrder(getTaskPriorityOptionId(b as TaskEntityWithProperties));
  return difference || sortByUpdatedAt(a, b);
};

const sortByStatus = (a: EntityData, b: EntityData) => {
  const difference =
    getStatusOrder(getTaskStatusOptionId(a as TaskEntityWithProperties)) -
    getStatusOrder(getTaskStatusOptionId(b as TaskEntityWithProperties));
  return difference || sortByUpdatedAt(a, b);
};

export const SORT_CONFIGS = {
  updated_at: { id: 'updated_at', fn: sortByUpdatedAt },
  created_at: { id: 'created_at', fn: sortByCreatedAt },
  viewed_at: { id: 'viewed_at', fn: sortByViewedAt },
  priority: { id: 'priority', fn: sortByPriority },
  status: { id: 'status', fn: sortByStatus },
} satisfies Record<SystemSortOption, SortConfig<EntityData, SystemSortOption>>;
