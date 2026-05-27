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
