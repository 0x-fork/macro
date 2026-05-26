import { cn, Tooltip } from '@ui';

type MessageFlagProps = {
  text: string;
  tooltip?: string;
  highlightAbove?: boolean;
  highlightBelow?: boolean;
  class?: string;
};

export function MessageFlag(props: MessageFlagProps) {
  return (
    <div
      class={cn(
        'relative flex items-center justify-center gap-3 py-6',
        props.class
      )}
    >
      {/* Top connector terminator square */}
      <div
        class={cn(
          'absolute left-(--left-of-connector) top-0 size-1.5 -translate-x-1/2 bg-edge-muted',
          props.highlightAbove && 'bg-accent'
        )}
      />
      {/* Bottom connector terminator square */}
      <div
        class={cn(
          'absolute left-(--left-of-connector) bottom-0 size-1.5 -translate-x-1/2 bg-edge-muted',
          props.highlightBelow && 'bg-accent'
        )}
      />
      <Tooltip label={props.tooltip ?? props.text} placement="top">
        <span
          class={cn(
            'text-xs text-ink-muted shrink-0 bg-ink/10 px-2 py-0.5 rounded cursor-default',
            props.highlightBelow && 'text-accent-ink bg-accent/15'
          )}
        >
          {props.text}
        </span>
      </Tooltip>
    </div>
  );
}
