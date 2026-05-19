interface HexDashedIconProps {
  class?: string;
}

export const HexDashedIcon = (props: HexDashedIconProps) => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 12 12"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      class={props.class}
    >
      <path
        d="M10.5 6L8.25 2.1H3.75L1.5 6L3.75 9.9H8.25L10.5 6Z"
        stroke="currentColor"
        stroke-width="1"
        stroke-linejoin="round"
        stroke-dasharray="2 2"
      />
    </svg>
  );
};

export default HexDashedIcon;
