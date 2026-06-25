import type { Component, JSX } from 'solid-js';
import { Show } from 'solid-js';
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

/** Trailing label + styling for a tool call's terminal status. */
const STATUS_LABEL: Record<string, string> = {
  failed: 'Failed',
  denied: 'Denied',
  cancelled: 'Cancelled',
  unresolved: 'Needs permission',
};

function BaseToolCall(props: ToolCallProps) {
  const status = useToolError();
  const grouped = () => props.renderContext.grouped === true;
  // The unresolved (awaiting-permission) call is not an error — keep it
  // un-muted so it reads as live/pending; denied / cancelled / failed are
  // muted like the existing failed state.
  const muted = () => !!status && status !== 'unresolved';
  const trailing = () => {
    const s = status;
    if (!s) return undefined;
    return (
      <span
        class="text-ink"
        classList={{ 'text-ink-extra-muted': s === 'unresolved' }}
      >
        {STATUS_LABEL[s]}
      </span>
    );
  };

  return (
    <Tool.Root grouped={grouped()} muted={muted()}>
      <Tool.Row align={props.align} icon={props.icon} trailing={trailing()}>
        {props.children}
      </Tool.Row>
      <Show when={props.response}>
        <Tool.Response>{props.response}</Tool.Response>
      </Show>
    </Tool.Root>
  );
}

function BaseToolResponse(props: ToolResponseProps) {
  return (
    <Tool.Root>
      <div class="px-3 py-2">{props.children && props.children}</div>
    </Tool.Root>
  );
}

export function BaseTool(props: ToolCallProps | ToolResponseProps) {
  if (props.type === 'call') return BaseToolCall(props);
  return BaseToolResponse(props);
}
