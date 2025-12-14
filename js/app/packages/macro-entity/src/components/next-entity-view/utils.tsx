import { EntityIcon } from '@core/component/EntityIcon';
import { UserIcon } from '@core/component/UserIcon';
import type { EntityData } from '@macro-entity';
import { useUserId } from '@service-gql/client';
import { Show } from 'solid-js';

const THREAD_GAP = 6;
export const ThreadBorder = () => (
  <div
    class="absolute left-[calc(0.5rem+1px)] w-[1px] border-l border-edge-muted -top-0.75"
    style={{ height: `${THREAD_GAP}px` }}
  />
);

export function DirectMessageIcon(props: { entity: EntityData }) {
  const userId = useUserId();
  const participantId = () =>
    props.entity.type === 'channel'
      ? (props.entity.particpantIds ?? []).filter((id) => id !== userId()).at(0)
      : undefined;

  const Fallback = () => <EntityIcon targetType="directMessage" />;

  return (
    <div class="bg-panel size-5 rounded-full p-[2px]">
      <Show when={participantId()} fallback={<Fallback />}>
        {(id) => <UserIcon id={id()} isDeleted={false} size="xs" />}
      </Show>
    </div>
  );
}

export function UnreadIndicator(props: { active?: boolean }) {
  return (
    <div class="flex size-4 items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        classList={{
          'fill-accent': true,
          'opacity-0': !props.active,
        }}
        viewBox="0 0 8 8"
        width="75%"
        height="75%"
        fill="none"
      >
        <path d="M3.39622 8C3.29136 8 3.23894 7.94953 3.23894 7.84858L3.33068 5.13565L0.932129 6.58675C0.836012 6.63722 0.76174 6.6204 0.709312 6.53628L0.0801831 5.56467C0.0190178 5.47213 0.0364936 5.40063 0.132611 5.35016L2.58359 4.07571L0.09329 2.88959C-0.00282696 2.83912 -0.0246717 2.77182 0.0277557 2.6877L0.59135 1.58991C0.643778 1.49737 0.71805 1.47634 0.814167 1.52681L3.31758 2.95268L3.21272 0.151421C3.21272 0.0504735 3.26515 0 3.37 0H4.57583C4.68069 0 4.73312 0.0504735 4.73312 0.151421L4.64137 2.94006L7.14478 1.40063C7.2409 1.34175 7.3108 1.35857 7.35449 1.4511L7.97051 2.46057C8.02294 2.5531 8.00546 2.6204 7.91808 2.66246L5.40157 4L7.82633 5.18612C7.91371 5.23659 7.93556 5.30389 7.89187 5.38801L7.36759 6.4858C7.32391 6.58675 7.25837 6.60778 7.17099 6.54889L4.6938 5.13565L4.78554 7.84858C4.79428 7.94953 4.74185 8 4.62826 8H3.39622Z" />
      </svg>
    </div>
  );
}

export function SharedBadge(props: { ownerId: string }) {
  return (
    <div class="font-mono font-medium user-select-none uppercase flex items-center text-ink-extra-muted p-0.5 gap-1 text-[0.625rem] rounded-full border border-edge-muted pr-2">
      <UserIcon id={props.ownerId} size="xs" />
      shared
    </div>
  );
}

export const toFormattedDate = (timestamp: number) => {
  if (timestamp < 1e12) {
    timestamp *= 1000;
  }
  const date = new Date(timestamp);
  const currentDate = new Date();
  if (date.getDate() === currentDate.getDate()) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (date.getFullYear() === currentDate.getFullYear()) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  return date.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
};
