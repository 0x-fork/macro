import { cn } from '@ui/utils/classname';
import { formatTime, formatEmailDate } from '@core/util/date';
import { Tooltip } from '@core/component/Tooltip';
import { useMessage } from './context';
import { Match, Switch, createMemo } from 'solid-js';
import { isToday, isYesterday, toDate } from 'date-fns';

type TimestampProps = {
  class?: string;
  compact?: boolean;
  format?: 'dateAndTime' | 'time';
};

export function Timestamp(props: TimestampProps) {
  const message = useMessage();

  const createdAt = createMemo(() => {
    const date = message().created_at;
    return date instanceof Date ? date : toDate(date);
  });

  const displayText = createMemo(() => {
    const date = createdAt();

    if (isToday(date)) {
      return formatTime(date);
    }

    if (isYesterday(date)) {
      return `Yesterday at ${formatTime(date)}`;
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  });

  const fullDateTime = createMemo(() => formatEmailDate(createdAt()));

  return (
    <Tooltip tooltip={fullDateTime()} placement="top">
      <span
        class={cn(
          'text-xs text-ink-placeholder cursor-default',
          props.compact && 'leading-none',
          props.class
        )}
      >
        <Switch>
          <Match when={props.format === 'time'}>
            {formatTime(message().created_at)}
          </Match>
          <Match when={props.format === 'dateAndTime' || true}>
            {displayText()}
          </Match>
        </Switch>
      </span>
    </Tooltip>
  );
}
