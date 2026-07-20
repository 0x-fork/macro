import { cn } from '@ui';
import { For } from 'solid-js';
import { DEFAULT_TAG_COLOR } from './tagColors';

export function TagDot(props: { color?: string; class?: string }) {
  return (
    <span
      class={cn('size-2.5 shrink-0 rounded-full', props.class)}
      style={{ 'background-color': props.color ?? DEFAULT_TAG_COLOR }}
    />
  );
}

export function TagDotStack(props: {
  colors: (string | undefined)[];
  max?: number;
  class?: string;
  dotClass?: string;
}) {
  const colors = () => props.colors.slice(0, props.max ?? 3);

  return (
    <span class={cn('flex items-center', props.class)}>
      <For each={colors()}>
        {(color, index) => (
          <TagDot
            color={color}
            class={cn(
              'ring-2 ring-surface',
              props.dotClass ?? 'size-2.5',
              index() > 0 && '-ml-1'
            )}
          />
        )}
      </For>
    </span>
  );
}
