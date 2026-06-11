import { Button, cn } from '@ui';
import type { JSX } from 'solid-js';

export function InputActionButton(props: {
  label: string;
  onClick?: (event: MouseEvent) => void;
  active?: boolean;
  children: JSX.Element;
}) {
  return (
    <Button
      title={props.label}
      aria-label={props.label}
      label={props.label}
      variant="ghost"
      size="icon-sm"
      noTouchResize
      class={cn(
        'size-6! p-0! rounded-sm text-ink-muted hover:text-ink',
        props.active && 'text-ink'
      )}
      onPointerDown={(event: PointerEvent) => event.preventDefault()}
      onClick={(event) => props.onClick?.(event)}
    >
      {props.children}
    </Button>
  );
}
