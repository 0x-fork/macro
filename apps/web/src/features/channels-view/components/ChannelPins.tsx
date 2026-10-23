import { type ChannelEntity, Entity } from '@entity';
import { cn } from '@ui';
import type { ParentProps } from 'solid-js';
import { Show } from 'solid-js';

/** How many favorites the mobile Channels list pins above its conversations. */
export const MAX_PINNED_CHANNELS = 6;

/** Three-across grid of pinned conversations, like iMessage pins. */
export function ChannelPinGrid(props: ParentProps) {
  return (
    <div
      role="group"
      aria-label="Pinned conversations"
      class="grid grid-cols-3 gap-y-4 px-(--mobile-chrome-gutter) pt-1 pb-5"
    >
      {props.children}
    </div>
  );
}

export function ChannelPin(props: {
  channel: ChannelEntity;
  unread: boolean;
  onActivate: (event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      class="flex w-full min-w-0 flex-col items-center gap-1.5 outline-none"
      onClick={(event) => props.onActivate(event)}
    >
      <span class="grid size-18 shrink-0 place-items-center overflow-hidden rounded-full border border-edge bg-surface-2 text-ink-muted [&_img]:size-full [&_img]:object-cover [&_svg]:size-8">
        <Entity.Icon entity={props.channel} suppressClick showTooltip={false} />
      </span>
      <span class="flex max-w-full min-w-0 items-center gap-1 px-1">
        <Show when={props.unread}>
          <span
            aria-label="Unread"
            class="size-2 shrink-0 rounded-full bg-accent"
          />
        </Show>
        <span
          class={cn(
            'min-w-0 truncate text-xs',
            props.unread ? 'text-ink' : 'text-ink-muted'
          )}
        >
          {props.channel.name}
        </span>
      </span>
    </button>
  );
}
