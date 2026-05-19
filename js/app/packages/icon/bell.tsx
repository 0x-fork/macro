export const AnimatedBellIcon = (props: {
  triggerAnimation?: boolean;
  class?: string;
}) => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 256 256"
      fill="currentColor"
      stroke="none"
      xmlns="http://www.w3.org/2000/svg"
      overflow="visible"
      class={`animated-bell-icon ${props.triggerAnimation ? 'animating' : ''} ${props.class ?? ''}`}
    >
      <style>{`
        .animated-bell-icon {
          .bell-body {
            transform-origin: 128px 40px;
            transition: transform 0.15s ease;
          }
        }
        .animated-bell-icon.animating {
          .bell-body {
            animation: bell-ring 0.4s ease;
          }
        }
        @keyframes bell-ring {
          0% { transform: rotate(0deg); }
          20% { transform: rotate(12deg); }
          40% { transform: rotate(-10deg); }
          60% { transform: rotate(6deg); }
          80% { transform: rotate(-4deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
      <g class="bell-body">
        <path d="M221.8,175.94C216.25,166.84,208,139.73,208,104a80,80,0,1,0-160,0c0,35.34-8.26,62.38-13.81,71.94A16,16,0,0,0,48,200H88.81a40,40,0,0,0,78.38,0H208a16,16,0,0,0,13.8-24.06ZM128,216a24,24,0,0,1-22.62-16h45.24A24,24,0,0,1,128,216ZM48,184c7.7-13.24,16-43.92,16-80a64,64,0,1,1,128,0c0,36.05,8.28,66.73,16,80Z" />
      </g>
    </svg>
  );
};
