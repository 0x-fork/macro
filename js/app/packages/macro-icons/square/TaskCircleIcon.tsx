import { createMemo } from 'solid-js';

export type TaskStatus = 'created' | 'in-progress' | 'in-review' | 'done' | 'cancelled';

interface TaskCircleIconProps {
  status: TaskStatus;
  class?: string;
}

// Degrees of rotation for each status (counter-clockwise from top)
const STATUS_DEGREES: Record<TaskStatus, number> = {
  created: 60,
  'in-progress': 120,
  'in-review': 240,
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

// Hex path centered at 6,6 with radius ~4.5 (flat-top orientation)
const HEX_OUTLINE = 'M10.5 6L8.25 2.1H3.75L1.5 6L3.75 9.9H8.25L10.5 6Z';
// Smaller inner hex for progress fill
const HEX_INNER = 'M9 6L7.5 3.4H4.5L3 6L4.5 8.6H7.5L9 6Z';

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

      {/* Hex outline */}
      <path
        d={HEX_OUTLINE}
        stroke="currentColor"
        stroke-width="1"
        stroke-linejoin="round"
        fill={isDone() ? 'currentColor' : 'none'}
        class="transition-all duration-200"
      />

      {/* Progress fill using foreignObject for CSS mask support - counter-clockwise from top-left */}
      <foreignObject x="2" y="2.5" width="8" height="7" opacity={isCancelled() || isDone() ? 0 : 1}>
        <div
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            'width': '100%',
            'height': '100%',
            'background': 'var(--icon-color, currentColor)',
            'clip-path': 'polygon(28% 12%, 72% 12%, 88% 50%, 72% 88%, 28% 88%, 12% 50%)',
            '--progress-angle': `${degrees()}deg`,
            'mask-image': `conic-gradient(from -30deg at 50% 50%, transparent 0deg, transparent calc(360deg - var(--progress-angle)), black calc(360deg - var(--progress-angle)))`,
            '-webkit-mask-image': `conic-gradient(from -30deg at 50% 50%, transparent 0deg, transparent calc(360deg - var(--progress-angle)), black calc(360deg - var(--progress-angle)))`,
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
