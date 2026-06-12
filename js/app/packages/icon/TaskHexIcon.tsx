import { createMemo, For, Show } from 'solid-js';

export type TaskStatus = 'created' | 'in-progress' | 'in-review' | 'done' | 'cancelled';

interface TaskHexIconProps {
  status: TaskStatus;
  class?: string;
}

const STATUS_SEGMENTS: Record<TaskStatus, number> = {
  created: 0,
  'in-progress': 3,
  'in-review': 5,
  done: 6,
  cancelled: 0,
};

const CENTER = '6,6';

// Point-up hexagon. This is the final geometry, not a transformed flat hex.
// Keeping the outline and segment points in the same coordinate space prevents
// the inner fills from drifting out of alignment with the ring.
const HEX_POINTS = [
  '6,1.5',
  '9.897,3.75',
  '9.897,8.25',
  '6,10.5',
  '2.103,8.25',
  '2.103,3.75',
];

const HEX_OUTLINE = HEX_POINTS.join(' ');

// Clockwise from the upper-right wedge.
const SEGMENTS = [
  `${CENTER} ${HEX_POINTS[0]} ${HEX_POINTS[1]}`,
  `${CENTER} ${HEX_POINTS[1]} ${HEX_POINTS[2]}`,
  `${CENTER} ${HEX_POINTS[2]} ${HEX_POINTS[3]}`,
  `${CENTER} ${HEX_POINTS[3]} ${HEX_POINTS[4]}`,
  `${CENTER} ${HEX_POINTS[4]} ${HEX_POINTS[5]}`,
  `${CENTER} ${HEX_POINTS[5]} ${HEX_POINTS[0]}`,
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
      <g transform="rotate(30 6 6)">
        <Show when={!isDone()}>
          <For each={SEGMENTS}>
            {(points, i) => (
              <Show when={!isCancelled() && i() < activeSegments()}>
                <polygon points={points} fill="currentColor" />
              </Show>
            )}
          </For>
        </Show>

        <polygon
          points={HEX_OUTLINE}
          stroke="currentColor"
          stroke-width="1"
          stroke-linejoin="round"
          fill={isDone() ? 'currentColor' : 'none'}
          class="transition-all duration-300"
        />
      </g>

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
