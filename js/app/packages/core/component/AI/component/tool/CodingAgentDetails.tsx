import { Show } from 'solid-js';
import type { NamedTool } from '@service-cognition/generated/tools/tool';

type Agent = NamedTool<'GetCodingAgentStatus', 'response'>['data'];

/** Shared detail block for coding-agent tool responses. */
export const CodingAgentDetails = (props: { agent: Agent }) => (
  <div class="flex flex-col gap-1 text-xs">
    <div>
      Status: <span class="text-ink">{props.agent.status}</span>
    </div>
    <Show when={props.agent.branchName}>
      <div>
        Branch: <span class="text-ink">{props.agent.branchName}</span>
      </div>
    </Show>
    <Show when={props.agent.prUrl}>
      <a
        class="text-ink underline"
        href={props.agent.prUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
      >
        View pull request
      </a>
    </Show>
    <Show when={props.agent.webUrl}>
      <a
        class="text-ink underline"
        href={props.agent.webUrl ?? undefined}
        target="_blank"
        rel="noreferrer"
      >
        View agent
      </a>
    </Show>
    <Show when={props.agent.summary}>
      <div class="text-ink-placeholder">{props.agent.summary}</div>
    </Show>
  </div>
);
