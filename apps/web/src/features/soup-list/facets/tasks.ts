import { getTaskStatusOptionId, isTaskEntity } from '@entity';
import {
  getTaskAssigneeIds,
  getTaskPriorityOptionId,
} from '@entity/utils/task-properties';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { facet, NO_ASSIGNEE, selectProp } from './base';

// One facet per property id (OR within, AND across). Assignee is
// parametric (dynamic ids) and carries a predicate resolver for the client path.

const STATUS = SYSTEM_PROPERTY_IDS.STATUS;
const PRIORITY = SYSTEM_PROPERTY_IDS.PRIORITY;
const ASSIGNEES = SYSTEM_PROPERTY_IDS.ASSIGNEES;
const P = PROPERTY_OPTION_IDS;

const taskStatusOption = (id: string, value: string) => ({
  id,
  clause: selectProp(STATUS, value),
  predicate: (entity: Parameters<typeof isTaskEntity>[0]) =>
    isTaskEntity(entity) && getTaskStatusOptionId(entity) === value,
});

export const TASK_STATUS = facet({
  id: 'task-status',
  mode: 'or',
  multiple: true,
  options: [
    taskStatusOption('task-not-started', P.STATUS.NOT_STARTED),
    taskStatusOption('task-in-progress', P.STATUS.IN_PROGRESS),
    taskStatusOption('task-in-review', P.STATUS.IN_REVIEW),
    taskStatusOption('task-completed', P.STATUS.COMPLETED),
    taskStatusOption('task-canceled', P.STATUS.CANCELED),
  ],
});

const namedPriorities = [
  P.PRIORITY.URGENT,
  P.PRIORITY.HIGH,
  P.PRIORITY.MEDIUM,
  P.PRIORITY.LOW,
];

export const TASK_PRIORITY = facet({
  id: 'task-priority',
  mode: 'or',
  multiple: true,
  options: [
    ...[
      ['task-urgent', P.PRIORITY.URGENT],
      ['task-high-priority', P.PRIORITY.HIGH],
      ['task-medium-priority', P.PRIORITY.MEDIUM],
      ['task-low-priority', P.PRIORITY.LOW],
    ].map(([id, value]) => ({
      id,
      clause: selectProp(PRIORITY, value),
      predicate: (entity: Parameters<typeof isTaskEntity>[0]) =>
        isTaskEntity(entity) && getTaskPriorityOptionId(entity) === value,
    })),
    {
      id: 'task-no-priority',
      // none of the named priorities — a compound exclude
      clause: (b) => ({
        propf: b.and(
          ...namedPriorities.map((value) =>
            b.not(
              b.eq('properties', {
                propertyId: PRIORITY,
                type: 'select',
                value,
              })
            )
          )
        ),
      }),
      predicate: (entity) =>
        isTaskEntity(entity) &&
        !namedPriorities.includes(
          getTaskPriorityOptionId(entity) as (typeof namedPriorities)[number]
        ),
    },
  ],
});

// open id space: any entity id resolves to its clause + predicate; NO_ASSIGNEE is
// predicate-only (no backend clause).
export const TASK_ASSIGNEE = facet({
  id: 'assignee',
  mode: 'or',
  options: (optionId) =>
    optionId === NO_ASSIGNEE
      ? {
          id: optionId,
          predicate: (e) =>
            isTaskEntity(e) && getTaskAssigneeIds(e).length === 0,
        }
      : {
          id: optionId,
          clause: (b) => ({
            propf: b.eq('properties', {
              propertyId: ASSIGNEES,
              type: 'entity',
              value: optionId,
            }),
          }),
          predicate: (e) =>
            isTaskEntity(e) && getTaskAssigneeIds(e).includes(optionId),
        },
});
