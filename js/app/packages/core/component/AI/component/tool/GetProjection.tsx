import Stack from '@phosphor-icons/core/regular/stack.svg';
import { createSignal } from 'solid-js';
import { BaseTool } from './BaseTool';
import { Tool } from './Tool';
import { createToolRenderer } from './ToolRenderer';

const handler = createToolRenderer({
  name: 'GetProjection',
  render: (ctx) => {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const result = () => ctx.response?.data.result ?? undefined;
    const hasResult = () => !!result();
    const statusText = () => {
      if (!ctx.response) return undefined;
      if (!hasResult()) return 'No Result';
      return ctx.response.data.status;
    };

    return (
      <BaseTool
        icon={Stack}
        renderContext={ctx.renderContext}
        type="call"
        response={
          hasResult() && isExpanded() ? (
            <div class="max-h-120 overflow-y-auto">
              <pre class="whitespace-pre-wrap break-words px-3 py-2 text-ink-placeholder">
                {result()}
              </pre>
            </div>
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <span class="min-w-0 truncate">
              Read projection{' '}
              <span class="text-ink">{ctx.tool.data.projectionId}</span>
            </span>
          </div>
          <Tool.ResultToggle
            expanded={isExpanded()}
            onToggle={() => setIsExpanded((expanded) => !expanded)}
            showToggle={hasResult()}
            status={statusText()}
          />
        </div>
      </BaseTool>
    );
  },
});

export const getProjectionHandler = handler;
