import PriorityHigh from '@macro-icons/wide/priority-high.svg';
import PriorityLow from '@macro-icons/wide/priority-low.svg';
import PriorityMedium from '@macro-icons/wide/priority-medium.svg';
import PriorityUrgent from '@macro-icons/wide/priority-urgent.svg';
import { TaskCircleIcon, type TaskStatus } from '@macro-icons/square/TaskCircleIcon';
import { type Component, createMemo, Match, Show, Switch } from 'solid-js';
import { twMerge } from 'tailwind-merge';
import { PROPERTY_OPTION_IDS } from '../../constants';

const STATUS_MAP: Record<string, TaskStatus> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 'created',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 'in-progress',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 'in-review',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 'done',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 'cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  [PROPERTY_OPTION_IDS.STATUS.NOT_STARTED]: 'text-task',
  [PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS]: 'text-alert-ink',
  [PROPERTY_OPTION_IDS.STATUS.IN_REVIEW]: 'text-note',
  [PROPERTY_OPTION_IDS.STATUS.COMPLETED]: 'text-accent',
  [PROPERTY_OPTION_IDS.STATUS.CANCELED]: 'text-ink-muted',
};

const PRIORITY_IDS = new Set([
  PROPERTY_OPTION_IDS.PRIORITY.LOW,
  PROPERTY_OPTION_IDS.PRIORITY.MEDIUM,
  PROPERTY_OPTION_IDS.PRIORITY.HIGH,
  PROPERTY_OPTION_IDS.PRIORITY.URGENT,
]);

const STATUS_IDS = new Set(Object.keys(STATUS_MAP));

type PropertyValueIconProps = {
  optionId: string;
  class?: string;
};

const knownPropertyIds = new Set<string>(
  Object.values(PROPERTY_OPTION_IDS).flatMap((group) => Object.values(group))
);

/**
 * Render appropriate icons for property option values - based on common,
 * hard-coded property option ids.
 *
 * @example
 * ```tsx
 * <PropertyValueIcon
 *   optionId={PROPERTY_OPTION_IDS.PRIORITY.HIGH}
 * />
 * ```
 */
export const PropertyValueIcon: Component<PropertyValueIconProps> = (props) => {
  const isStatus = createMemo(() => STATUS_IDS.has(props.optionId));
  const isPriority = createMemo(() => PRIORITY_IDS.has(props.optionId));

  const status = createMemo(() => STATUS_MAP[props.optionId] ?? 'created');
  const statusColor = createMemo(() => STATUS_COLORS[props.optionId] ?? 'text-task');

  return (
    <>
      <Show when={isStatus()}>
        <TaskCircleIcon
          status={status()}
          class={twMerge('size-3', props.class, statusColor())}
        />
      </Show>

      <Show when={isPriority()}>
        <Switch>
          <Match when={props.optionId === PROPERTY_OPTION_IDS.PRIORITY.LOW}>
            <PriorityLow
              class={twMerge('size-3', props.class, 'text-ink-extra-muted')}
            />
          </Match>
          <Match when={props.optionId === PROPERTY_OPTION_IDS.PRIORITY.MEDIUM}>
            <PriorityMedium
              class={twMerge('size-3', props.class, 'text-ink-extra-muted')}
            />
          </Match>
          <Match when={props.optionId === PROPERTY_OPTION_IDS.PRIORITY.HIGH}>
            <PriorityHigh
              class={twMerge('size-3', props.class, 'text-ink-extra-muted')}
            />
          </Match>
          <Match when={props.optionId === PROPERTY_OPTION_IDS.PRIORITY.URGENT}>
            <PriorityUrgent class={twMerge('size-3', props.class, 'text-accent')} />
          </Match>
        </Switch>
      </Show>
    </>
  );
};
