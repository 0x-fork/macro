import type { ToolName } from '@service-cognition/generated/tools/tool';
import { type Component, Show } from 'solid-js';
import type { RenderContext, ToolRenderContext } from './ToolRenderer';
import { createToolRenderer } from './ToolRenderer';

/**
 * A delegated tool is one the PRIMARY agent calls name-only (no arguments). A
 * fast secondary agent fills in the real arguments, which come back inside the
 * tool RESPONSE as `{ args, result }` (see the Rust `DelegatedTool<T>` /
 * `DelegatedToolResponse`). The delegation is an implementation detail — to the
 * user it must look exactly as if the primary agent had called the underlying
 * tool directly.
 *
 * `createDelegatedToolRenderer` builds a tool handler that renders transparently
 * from the delegated response's `args` (the underlying tool's call arguments),
 * so the same UI shows regardless of who produced the arguments.
 */
export function createDelegatedToolRenderer<TName extends ToolName>(config: {
  name: TName;
  /**
   * Render the underlying tool from the arguments the secondary agent produced
   * (the `args` field of the delegated response). `args` is `undefined` until
   * the response arrives — render a pending state if needed.
   */
  render: Component<{ args: Record<string, unknown> } & RenderContext>;
}) {
  const Render: Component<ToolRenderContext<TName> & RenderContext> = (ctx) => {
    // The delegated response is `{ args, result }`; the underlying tool's
    // arguments live in `args`. Until the secondary agent finishes there is no
    // response yet, so `args` is undefined — render nothing until then so the
    // delegation (and its brief latency) is invisible.
    const args = () =>
      (ctx.response as { args?: Record<string, unknown> } | undefined)?.args;
    return (
      <Show when={args()}>
        {(resolved) => (
          <config.render args={resolved()} renderContext={ctx.renderContext} />
        )}
      </Show>
    );
  };

  return createToolRenderer<TName>({ name: config.name, render: Render });
}
