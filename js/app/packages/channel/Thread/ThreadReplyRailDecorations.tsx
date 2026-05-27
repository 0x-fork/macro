import { cn } from '@ui/utils/classname';
import type { Accessor } from 'solid-js';
import { threadConnectorStyle } from './utils/thread-rail-geometry';

type ThreadReplyRailProps = {
  isReplying: Accessor<boolean>;
  firstThreadReplyNewMessage?: boolean;
};

export function ThreadReplyRailDecorations(props: ThreadReplyRailProps) {
  return (
    <div class="pointer-events-none absolute" style={threadConnectorStyle}>
      <div
        class={cn(
          'absolute text-rail -z-1 w-full h-full',
          props.firstThreadReplyNewMessage && 'text-accent'
        )}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 18"
          width="100%"
        >
          <path
            stroke="currentColor"
            vector-effect="non-scaling-stroke"
            d="M23 17 4 6.0303C2.5 5.1643.5 4 .5.5"
          />
        </svg>
      </div>
    </div>
  );
}
