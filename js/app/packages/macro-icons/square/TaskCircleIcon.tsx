import { createMemo } from 'solid-js';

export type TaskStatus = 'created' | 'in-progress' | 'in-review' | 'done' | 'cancelled';

interface TaskCircleIconProps {
  status: TaskStatus;
  class?: string;
}

// Degrees of rotation for each status (counter-clockwise from top)
const STATUS_DEGREES: Record<TaskStatus, number> = {
  created: 90,
  'in-progress': 180,
  'in-review': 270,
  done: 360,
  cancelled: 0,
};

// CSS to register custom property for animatable angle
const anglePropertyCSS = `
@property --progress-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

@keyframes checkmark-draw {
  from {
    stroke-dashoffset: 6;
  }
  to {
    stroke-dashoffset: 0;
  }
}
`;

export const TaskCircleIcon = (props: TaskCircleIconProps) => {
  const degrees = createMemo(() => STATUS_DEGREES[props.status] ?? 0);
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
      <style>{anglePropertyCSS}</style>

      {/* Circle outline */}
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="currentColor"
        stroke-width="1"
        fill="none"
      />

      {/* Progress pie using foreignObject for CSS mask support - counter-clockwise from top-left */}
      <foreignObject x="3" y="3" width="6" height="6" opacity={isCancelled() ? 0 : 1}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            'width': '100%',
            'height': '100%',
            'border-radius': '50%',
            'background': 'var(--icon-color, currentColor)',
            '--progress-angle': `${degrees()}deg`,
            'mask-image': `conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent calc(360deg - var(--progress-angle)), black calc(360deg - var(--progress-angle)))`,
            '-webkit-mask-image': `conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent calc(360deg - var(--progress-angle)), black calc(360deg - var(--progress-angle)))`,
            'transition': '--progress-angle 200ms ease-out',
          }}
        />
      </foreignObject>

      {/* Checkmark for done state */}
      <path
        d="M4.25 6L5.5 7.25L7.75 4.75"
        stroke="var(--color-panel, white)"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="6"
        stroke-dashoffset={isDone() ? 0 : 6}
        style={{
          animation: isDone() ? 'checkmark-draw 300ms ease-out forwards' : 'none',
        }}
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

export default TaskCircleIcon;
