import { cn } from '@ui/utils/classname';

interface ThreadRailProps {
  newMessage?: boolean;
  /** Horizontal position of the rail. Defaults to the connector (avatar
   * center); pass `var(--left-of-user-icon)` to sit left of the avatars. */
  left?: string;
  /** Top offset of the rail (defaults to 0). Used to push the first reply's
   * rail down to where the curved connector meets it. */
  top?: string;
}

export function ThreadRail(props: ThreadRailProps) {
  return (
    <div
      class={cn(
        'pointer-events-none absolute bottom-0 border-l border-rail -z-1',
        props.newMessage && 'border-accent'
      )}
      style={{
        left: props.left ?? 'var(--left-of-connector)',
        top: props.top ?? '0',
      }}
    />
  );
}
