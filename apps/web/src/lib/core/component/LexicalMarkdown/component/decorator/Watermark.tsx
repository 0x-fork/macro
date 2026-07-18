import type { WatermarkDecoratorProps } from '@macro-inc/lexical-core/nodes/WatermarkNode';
import { type Component, Show } from 'solid-js';

export const Watermark: Component<WatermarkDecoratorProps> = (props) => {
  return (
    <Show
      when={props.href}
      fallback={
        <span
          class="select-none macro-watermark-node text-ink/50"
          inert
          data-watermark
        >
          {props.content}
        </span>
      }
    >
      <a
        class="select-none macro-watermark-node text-ink/50 underline"
        inert
        data-watermark
        href={props.href}
        target="_blank"
        rel="noopener"
      >
        {props.content}
      </a>
    </Show>
  );
};
