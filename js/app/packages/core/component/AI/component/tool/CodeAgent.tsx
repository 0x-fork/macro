import GitPullRequest from '@phosphor-icons/core/regular/git-pull-request.svg';
import Robot from '@phosphor-icons/core/regular/robot.svg';
import { PulsingStar } from '@entity/components/PulsingStar';
import type { JSX } from 'solid-js';
import { Show } from 'solid-js';
import { BaseTool } from './BaseTool';
import { createToolRenderer, useToolError } from './ToolRenderer';

/**
 * Renders the `CodeAgent` tool call. The agent's live progress (plans, tool
 * calls, diffs) is rendered separately by {@link CodingSession} from the
 * streamed `codingAgentEvent` message parts; this row shows the delegated task
 * and, once finished, a link to the opened pull request.
 */
const handler = createToolRenderer({
  name: 'CodeAgent',
  render: (ctx) => {
    const error = useToolError();
    const isLoading = () => !ctx.response && !error;
    const prUrl = () => ctx.response?.data.pr_url ?? undefined;

    const Icon = (props: JSX.SvgSVGAttributes<SVGSVGElement>) => (
      <Show
        when={!isLoading()}
        fallback={
          <PulsingStar
            kind="streamIndicator"
            animate
            class={typeof props.class === 'string' ? props.class : undefined}
          />
        }
      >
        <Robot {...props} />
      </Show>
    );

    return (
      <BaseTool
        icon={Icon}
        renderContext={ctx.renderContext}
        type="call"
        response={
          ctx.response ? (
            <div class="flex flex-col gap-1">
              <span>{ctx.response.data.summary}</span>
              <Show when={prUrl()}>
                {(url) => (
                  <a
                    href={url()}
                    target="_blank"
                    rel="noreferrer"
                    class="text-ink hover:underline inline-flex items-center gap-1.5"
                  >
                    <GitPullRequest class="size-4" />
                    View pull request
                  </a>
                )}
              </Show>
            </div>
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span class="min-w-0 truncate">
            {isLoading() ? 'Coding: ' : 'Coded: '}
            {ctx.tool.data.task}
          </span>
        </div>
      </BaseTool>
    );
  },
});

export const codeAgentHandler = handler;
