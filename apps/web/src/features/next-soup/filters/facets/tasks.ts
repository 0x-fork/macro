import { isTaskEntity } from '@entity';
import { getTaskAssigneeIds } from '@entity/utils/task-properties';
import { PROPERTY_OPTION_IDS, SYSTEM_PROPERTY_IDS } from '@property/constants';
import { facet, NO_ASSIGNEE, selectProp } from './base';

// One facet per property id (OR within, AND across). Assignee is
// parametric (dynamic ids) and carries a predicate resolver for the client path.

const STATUS = SYSTEM_PROPERTY_IDS.STATUS;
const PRIORITY = SYSTEM_PROPERTY_IDS.PRIORITY;
const ASSIGNEES = SYSTEM_PROPERTY_IDS.ASSIGNEES;
const P = PROPERTY_OPTION_IDS;

export const TASK_STATUS = facet({
  id: 'task-status',
  mode: 'or',
  multiple: true,
  options: [
    {
      id: 'task-not-started',
      clause: selectProp(STATUS, P.STATUS.NOT_STARTED),
    },
    {
      id: 'task-in-progress',
      clause: selectProp(STATUS, P.STATUS.IN_PROGRESS),
    },
    { id: 'task-in-review', clause: selectProp(STATUS, P.STATUS.IN_REVIEW) },
    { id: 'task-completed', clause: selectProp(STATUS, P.STATUS.COMPLETED) },
    { id: 'task-canceled', clause: selectProp(STATUS, P.STATUS.CANCELED) },
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
    { id: 'task-urgent', clause: selectProp(PRIORITY, P.PRIORITY.URGENT) },
    { id: 'task-high-priority', clause: selectProp(PRIORITY, P.PRIORITY.HIGH) },
    {
      id: 'task-medium-priority',
      clause: selectProp(PRIORITY, P.PRIORITY.MEDIUM),
    },
    { id: 'task-low-priority', clause: selectProp(PRIORITY, P.PRIORITY.LOW) },
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
