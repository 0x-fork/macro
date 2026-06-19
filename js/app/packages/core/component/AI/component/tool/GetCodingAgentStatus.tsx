import CodeIcon from '@icon/wide-file-code.svg';
import { createSignal, Show } from 'solid-js';
import { BaseTool } from './BaseTool';
import { CodingAgentDetails } from './CodingAgentDetails';
import { Tool } from './Tool';
import { createToolRenderer, useToolError } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'GetCodingAgentStatus',
  render: (ctx) => {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const error = useToolError();
    const isLoading = () => !ctx.response && !error;
    const agent = () => ctx.response?.data;
    const hasResult = () => !!agent();
    const statusText = () => {
      if (isLoading()) return 'Checking…';
      if (error) return undefined;
      return agent()?.status ?? 'No result';
    };

    return (
      <BaseTool
        icon={CodeIcon}
        renderContext={ctx.renderContext}
        type="call"
        response={
          hasResult() && isExpanded() ? (
            <CodingAgentDetails agent={agent()!} />
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span class="min-w-0 truncate">Check coding agent status</span>
          </div>
          <Show when={hasResult() || isLoading()}>
            <Tool.ResultToggle
              expanded={isExpanded()}
              onToggle={() => setIsExpanded((expanded) => !expanded)}
              showToggle={hasResult()}
              status={statusText()}
            />
          </Show>
        </div>
      </BaseTool>
    );
  },
});

export const getCodingAgentStatusHandler = handler;
