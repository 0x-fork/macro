import { UserIcon } from '@core/component/UserIcon';
import { formatRelativeDate } from '@core/util/time';
import CaretRight from '@phosphor/caret-right.svg';
import { cn } from '@ui';
import { For, Show, splitProps, type JSX } from 'solid-js';
import { getThreadReplyCountLabel } from './utils/thread-reply-indicator-helpers';

type ThreadCollapsedIndicatorProps =
  JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    collapsedRepliesCount: number;
    participants: string[];
    latestReplyAt?: string;
    hasNewMessages?: boolean;
  };

const MAX_VISIBLE_PARTICIPANTS = 3;

export function ThreadCollapsedIndicator(props: ThreadCollapsedIndicatorProps) {
  const [local, rest] = splitProps(props, [
    'class',
    'collapsedRepliesCount',
    'participants',
    'latestReplyAt',
    'hasNewMessages',
  ]);

  const visibleParticipants = () =>
    local.participants.slice(0, MAX_VISIBLE_PARTICIPANTS);

  return (
    <button
      type="button"
      class={cn(
        'flex flex-row gap-2 items-center text-xs rounded-md px-2 py-1.5 bg-ink/5 hover:bg-ink/10 hover-transition-bg select-none outline-none',
        local.hasNewMessages && 'bg-accent/10 hover:bg-accent/15',
        local.class
      )}
      {...rest}
    >
      <Show when={local.participants.length > 0}>
        <div class="flex flex-row items-center -space-x-2">
          <For each={visibleParticipants()}>
            {(userId) => (
              <div class="size-4 rounded-full ring-1 ring-surface">
                <UserIcon
                  id={userId}
                  size="fill"
                  suppressClick
                  showTooltip={false}
                  isDeleted={false}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="flex flex-col items-start">
        <div class="flex items-center gap-1">
          <p class={cn('font-medium whitespace-nowrap', local.hasNewMessages ? 'text-accent-ink' : 'text-ink-muted')}>
            {getThreadReplyCountLabel(local.collapsedRepliesCount)}
          </p>
          <CaretRight class="size-3.5 text-ink-muted" />
        </div>
        <Show when={local.latestReplyAt}>
          <p class="text-[10px] text-ink-placeholder whitespace-nowrap">
            {formatRelativeDate(local.latestReplyAt!)}
          </p>
        </Show>
      </div>
    </button>
  );
}
