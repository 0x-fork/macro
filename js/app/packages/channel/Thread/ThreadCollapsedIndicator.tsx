import { UserIcon } from '@core/component/UserIcon';
import { formatRelativeDate } from '@core/util/time';
import CaretRight from '@icon/regular/caret-right.svg';
import { cn } from '@ui/utils/classname';
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
        'flex flex-row gap-2 items-center text-xs rounded-md px-2 py-1.5 bg-panel border border-edge-muted hover:bg-hover hover-transition-bg select-none outline-none',
        local.hasNewMessages && 'border border-accent',
        local.class
      )}
      {...rest}
    >
      <Show when={local.participants.length > 0}>
        <div class="flex flex-row items-center -space-x-2">
          <For each={visibleParticipants()}>
            {(userId) => (
              <div class="size-4 rounded-full ring-1 ring-panel">
                <UserIcon
                  id={userId}
                  size="fill"
                  suppressClick
                  showTooltip={false}
                  isDeleted={false}
                  fetchUrl={false}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="flex flex-col items-start">
        <p class={cn('font-medium whitespace-nowrap leading-tight', local.hasNewMessages ? 'text-accent-ink' : 'text-ink-muted')}>
          {getThreadReplyCountLabel(local.collapsedRepliesCount)}
        </p>
        <Show when={local.latestReplyAt}>
          <p class="text-[10px] text-ink-placeholder whitespace-nowrap leading-tight">
            {formatRelativeDate(local.latestReplyAt!)}
          </p>
        </Show>
      </div>
      <CaretRight class="size-3.5 text-ink-muted" />
    </button>
  );
}
