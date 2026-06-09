export const AnimatedCalendarIcon = (props: {
  triggerAnimation?: boolean;
  class?: string;
}) => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 -4 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      overflow="visible"
      class={`animated-calendar-icon ${props.triggerAnimation ? 'animating' : ''} ${props.class ?? ''}`}
    >
      <style>{`
        .animated-calendar-icon .cal-rings {
          transition: transform 0.2s ease;
          transform-origin: center top;
        }
        .animated-calendar-icon.animating .cal-rings {
          transform: translateY(-1.5px);
        }
      `}</style>
      {/* body */}
      <rect x="0.625" y="0.625" width="22.75" height="14.75" rx="2" />
      {/* binding rings */}
      <g class="cal-rings">
        <line x1="6.3125" y1="-2" x2="6.3125" y2="1" />
        <line x1="17.6875" y1="-2" x2="17.6875" y2="1" />
      </g>
      {/* header divider + grid */}
      <line x1="0.625" y1="4" x2="23.375" y2="4" />
      <line x1="0.625" y1="9.6875" x2="23.375" y2="9.6875" />
      <line x1="6.3125" y1="4" x2="6.3125" y2="15.375" />
      <line x1="12" y1="4" x2="12" y2="15.375" />
      <line x1="17.6875" y1="4" x2="17.6875" y2="15.375" />
    </svg>
  );
};
