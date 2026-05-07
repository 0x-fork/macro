import { isSameDay } from '@core/util/time';
import { formatEmailDate } from '@core/util/date';
import { toDate, isToday, isYesterday } from 'date-fns';
import { Show, createMemo } from 'solid-js';
import type { ChannelMessageListMeta } from './list-meta';
import { MessageFlag } from './MessageFlag';

type DateDividerProps = {
  createdAt: string;
  listMeta?: ChannelMessageListMeta;
  isReply?: boolean;
};

export function DateDivider(props: DateDividerProps) {
  const shouldRender = createMemo(() => {
    if (props.isReply) return false;
    if (!props.listMeta) return false;

    if (props.listMeta.index === 0) return true;

    const previousCreatedAt = props.listMeta.previousTopLevelCreatedAt;
    if (!previousCreatedAt) return false;

    return !isSameDay(new Date(props.createdAt), new Date(previousCreatedAt));
  });

  const formattedDate = () => {
    const date = toDate(props.createdAt);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const fullDateTime = () => formatEmailDate(props.createdAt);

  return (
    <Show when={shouldRender()}>
      <MessageFlag
        text={formattedDate()}
        tooltip={fullDateTime()}
        highlightAbove={props.listMeta?.isNewMessage}
        highlightBelow={props.listMeta?.isNewMessage}
      />
    </Show>
  );
}
