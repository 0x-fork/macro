import { createMemo, For, Show } from 'solid-js';

export type TaskStatus = 'created' | 'in-progress' | 'in-review' | 'done' | 'cancelled';

const segmentAnimation = `
@keyframes segment-pop {
  0% { transform: scale(0); }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
`;

interface TaskHexIconProps {
  status: TaskStatus;
  class?: string;
}

const STATUS_SEGMENTS: Record<TaskStatus, number> = {
  created: 1,
  'in-progress': 3,
  'in-review': 5,
  done: 6,
  cancelled: 0,
};

// Hexagon triangle segments (flat-top, centered at 6,6, radius ~4.5)
// Order: bottom → bottom-left → top-left → top → bottom-right → top-right
const SEGMENTS = [
  'M6 6L3.75 9.9L8.25 9.9Z',    // 0: bottom
  'M6 6L1.5 6L3.75 9.9Z',       // 1: bottom-left
  'M6 6L3.75 2.1L1.5 6Z',       // 2: top-left
  'M6 6L8.25 2.1L3.75 2.1Z',    // 3: top
  'M6 6L8.25 9.9L10.5 6Z',      // 4: bottom-right
  'M6 6L10.5 6L8.25 2.1Z',      // 5: top-right
];

export const TaskHexIcon = (props: TaskHexIconProps) => {
  const activeSegments = createMemo(() => STATUS_SEGMENTS[props.status] ?? 0);
  const isDone = () => props.status === 'done';
  const isCancelled = () => props.status === 'cancelled';

  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      {/* Hexagon outline */}
      <path
        d="M10.5 6L8.25 2.1H3.75L1.5 6L3.75 9.9H8.25L10.5 6Z"
        stroke="currentColor"
        stroke-width="1"
        stroke-linejoin="round"
        fill={isDone() ? 'currentColor' : 'none'}
        class="transition-all duration-300"
      />

      {/* Inject keyframe animation */}
      <style>{segmentAnimation}</style>

      {/* Triangle segments with staggered pop animation */}
      <For each={SEGMENTS}>
        {(d, i) => {
          const isActive = () => !isDone() && i() < activeSegments();
          return (
            <Show when={isActive()}>
              <path
                d={d}
                fill="currentColor"
                style={{
                  'transform-origin': '6px 6px',
                  'animation': `segment-pop 200ms ease-out ${i() * 50}ms both`,
                }}
              />
            </Show>
          );
        }}
      </For>

      {/* Checkmark for done state */}
      <path
        d="M4.25 6L5.5 7.25L7.75 4.75"
        stroke="var(--color-panel, white)"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="transition-opacity duration-300"
        opacity={isDone() ? 1 : 0}
      />

      {/* X mark for cancelled state */}
      <path
        d="M4.25 4.25L7.75 7.75M7.75 4.25L4.25 7.75"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        class="transition-opacity duration-300"
        opacity={isCancelled() ? 1 : 0}
      />
    </svg>
  );
};

export default TaskHexIcon;
