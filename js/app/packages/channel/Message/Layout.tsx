import { cn } from '@ui';
import { type JSX, splitProps } from 'solid-js';

export function Layout(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, rest] = splitProps(props, ['class', 'children']);

  return (
    <div
      class={cn('w-full pr-2 pl-(--message-padding-x)', local.class)}
      data-message-layout
      {...rest}
    >
      <div
        class="grid min-w-0 items-center gap-x-2 gap-y-0"
        style={{
          'grid-template-columns': '2rem minmax(0, 1fr)',
          'grid-template-areas': '"icon header" "content content" "footer footer"',
        }}
      >
        <div class="contents">{local.children}</div>
      </div>
    </div>
  );
}
