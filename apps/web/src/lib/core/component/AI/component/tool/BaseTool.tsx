import type { Component, JSX } from 'solid-js';
import { createSignal, Show } from 'solid-js';
import { Tool } from './Tool';
import { type RenderContext, useToolError } from './ToolRenderer';

type ToolCallProps = {
  align?: 'center' | 'start';
  icon: Component<JSX.SvgSVGAttributes<SVGSVGElement>>;
  renderContext: RenderContext['renderContext'];
  type: 'call';
  children: JSX.Element;
  response?: JSX.Element;
};
type ToolResponseProps = {
  children: JSX.Element;
  renderContext: RenderContext['renderContext'];
  type: 'response';
};

function BaseToolCall(props: ToolCallProps) {
  const failure = () => useToolError();
  const reason = () => failure()?.reason?.trim() || undefined;
  const [showReason, setShowReason] = createSignal(false);
  const grouped = () => props.renderContext.grouped === true;

  return (
    <Tool.Root grouped={grouped()} muted={!!failure()}>
      <Tool.Row
        align={props.align}
        grouped={grouped()}
        icon={props.icon}
        trailing={
          failure() ? (
            <Tool.ResultToggle
              expanded={showReason()}
              onToggle={() => setShowReason((shown) => !shown)}
              showToggle={reason() !== undefined}
              status={<span class="text-ink">Failed</span>}
            />
          ) : undefined
        }
      >
        {props.children}
      </Tool.Row>
      <Show when={props.response}>
        <Tool.Response>{props.response}</Tool.Response>
      </Show>
      <Show when={showReason() && reason()}>
        {(text) => (
          <p
            class="whitespace-pre-wrap break-words pb-2"
            classList={{ 'pl-6': grouped(), 'pl-9 pr-3': !grouped() }}
          >
            {text()}
          </p>
        )}
      </Show>
    </Tool.Root>
  );
}

function BaseToolResponse(props: ToolResponseProps) {
  return (
    <Tool.Root grouped={props.renderContext.grouped}>
      <div class="px-3 py-2">{props.children && props.children}</div>
    </Tool.Root>
  );
}

export function BaseTool(props: ToolCallProps | ToolResponseProps) {
  if (props.type === 'call') return BaseToolCall(props);
  return BaseToolResponse(props);
}
