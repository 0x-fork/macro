import { type Component } from 'solid-js';
import { twMerge } from 'tailwind-merge';

type TaskNotStartedIconProps = {
  class?: string;
};

export const TaskNotStartedIcon: Component<TaskNotStartedIconProps> = (props) => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={twMerge('size-3', props.class)}
    >
      <circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1"/>
      <clipPath id="innerCircleNotStarted">
        <circle cx="6" cy="6" r="3.5"/>
      </clipPath>
      <path d="M2 8.5 Q3.5 7.5 6 8.5 Q8.5 9.5 10 8.5 L10 10.5 L2 10.5 Z" fill="currentColor" clip-path="url(#innerCircleNotStarted)"/>
    </svg>
  );
};
