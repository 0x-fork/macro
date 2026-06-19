import CodeIcon from '@icon/wide-file-code.svg';
import { BaseTool } from './BaseTool';
import { Tool } from './Tool';
import { createToolRenderer, useToolError } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'StopCodingAgent',
  render: (ctx) => {
    const error = useToolError();
    const isLoading = () => !ctx.response && !error;
    const statusText = () => {
      if (isLoading()) return 'Stopping…';
      if (error) return undefined;
      return ctx.response?.data.success ? 'Stopped' : 'Failed';
    };

    return (
      <BaseTool icon={CodeIcon} renderContext={ctx.renderContext} type="call">
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <span class="min-w-0 flex-1 truncate">Stop coding agent</span>
          <Tool.ResultToggle
            expanded={false}
            onToggle={() => {}}
            showToggle={false}
            status={statusText()}
          />
        </div>
      </BaseTool>
    );
  },
});

export const stopCodingAgentHandler = handler;
