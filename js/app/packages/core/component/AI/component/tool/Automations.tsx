import Robot from '@icon/duotone/robot-duotone.svg';
import CaretRight from '@icon/regular/caret-right.svg?component-solid';
import type { NamedTool } from '@service-cognition/generated/tools/tool';
import { createSignal, For, Show } from 'solid-js';
import { BaseTool } from './BaseTool';
import { createToolRenderer } from './ToolRenderer';

type AutomationItem = NamedTool<
  'ListAutomations',
  'response'
>['data']['automations'][number];

function AutomationList(props: { automations: AutomationItem[] }) {
  return (
    <div class="flex flex-col gap-1">
      <For each={props.automations}>
        {(item) => (
          <div class="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-hover">
            <div class="flex min-w-0 flex-1 items-center gap-2">
              <span
                class="size-2 shrink-0 rounded-full"
                classList={{
                  'bg-green-500': item.enabled,
                  'bg-ink-extra-muted': !item.enabled,
                }}
              />
              <span class="min-w-0 truncate font-medium text-ink">
                {item.name}
              </span>
            </div>
            <span class="shrink-0 text-ink-extra-muted">{item.schedule}</span>
          </div>
        )}
      </For>
    </div>
  );
}

export const listAutomationsHandler = createToolRenderer({
  name: 'ListAutomations',
  render: (ctx) => {
    const [isExpanded, setIsExpanded] = createSignal(false);
    const automations = () => ctx.response?.data.automations ?? [];
    const hasResults = () => automations().length > 0;
    const statusText = () => {
      if (!ctx.response) return undefined;
      return ctx.response.data.summary;
    };

    return (
      <BaseTool
        icon={Robot}
        renderContext={ctx.renderContext}
        type="call"
        response={
          hasResults() && isExpanded() ? (
            <AutomationList automations={automations()} />
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span>List automations</span>
          <div class="flex shrink-0 items-center gap-1">
            <Show when={statusText()}>
              {(text) => (
                <span class="text-xs text-ink-extra-muted">{text()}</span>
              )}
            </Show>
            <Show when={hasResults()}>
              <button
                type="button"
                class="shrink-0 p-1 text-ink-muted hover:text-ink"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsExpanded((v) => !v);
                }}
              >
                <CaretRight
                  class="size-4 transition-transform"
                  classList={{ 'rotate-90': isExpanded() }}
                />
              </button>
            </Show>
          </div>
        </div>
      </BaseTool>
    );
  },
});

export const createAutomationHandler = createToolRenderer({
  name: 'CreateAutomation',
  render: (ctx) => (
    <BaseTool icon={Robot} renderContext={ctx.renderContext} type="call">
      <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
        <div class="min-w-0">
          Create automation{' '}
          <span class="text-accent">{ctx.tool.data.name}</span>
        </div>
        <Show when={ctx.response}>
          <span class="shrink-0 text-xs text-ink-extra-muted">Created</span>
        </Show>
      </div>
    </BaseTool>
  ),
});

export const editAutomationHandler = createToolRenderer({
  name: 'EditAutomation',
  render: (ctx) => {
    const changes = () => {
      const parts: string[] = [];
      if (ctx.tool.data.name != null) parts.push('name');
      if (ctx.tool.data.schedule != null) parts.push('schedule');
      if (ctx.tool.data.timezone != null) parts.push('timezone');
      if (ctx.tool.data.prompt != null) parts.push('prompt');
      if (ctx.tool.data.enabled != null) parts.push('enabled');
      return parts.join(', ');
    };

    return (
      <BaseTool icon={Robot} renderContext={ctx.renderContext} type="call">
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
          <div class="min-w-0">
            Edit automation{' '}
            <Show when={changes()}>
              {(text) => <span class="text-ink-extra-muted">({text()})</span>}
            </Show>
          </div>
          <Show when={ctx.response}>
            <span class="shrink-0 text-xs text-ink-extra-muted">Updated</span>
          </Show>
        </div>
      </BaseTool>
    );
  },
});

export const deleteAutomationHandler = createToolRenderer({
  name: 'DeleteAutomation',
  render: (ctx) => (
    <BaseTool icon={Robot} renderContext={ctx.renderContext} type="call">
      <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
        <span>Delete automation</span>
        <Show when={ctx.response}>
          <span class="shrink-0 text-xs text-ink-extra-muted">Deleted</span>
        </Show>
      </div>
    </BaseTool>
  ),
});
