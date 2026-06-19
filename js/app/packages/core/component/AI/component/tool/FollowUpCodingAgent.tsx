import CodeIcon from '@icon/wide-file-code.svg';
import { BaseTool } from './BaseTool';
import { Tool } from './Tool';
import { createToolRenderer, useToolError } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'FollowUpCodingAgent',
  render: (ctx) => {
    const error = useToolError();
    const isLoading = () => !ctx.response && !error;
    const statusText = () => {
      if (isLoading()) return 'Sending…';
      if (error) return undefined;
      return ctx.response?.data.success ? 'Sent' : 'Failed';
    };

    return (
      <BaseTool icon={CodeIcon} renderContext={ctx.renderContext} type="call">
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <span class="min-w-0 flex-1 truncate">
            Follow up with coding agent:{' '}
            <span class="text-ink">{ctx.tool.data.message}</span>
          </span>
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

export const followUpCodingAgentHandler = handler;
