import { ChatMessageMarkdown } from '@core/component/AI/component/message/ChatMessageMarkdown';
import CheckCircle from '@phosphor-icons/core/regular/check-circle.svg';
import Circle from '@phosphor-icons/core/regular/circle.svg';
import CircleNotch from '@phosphor-icons/core/regular/circle-notch.svg';
import FileDiff from '@phosphor-icons/core/regular/file-text.svg';
import GitPullRequest from '@phosphor-icons/core/regular/git-pull-request.svg';
import Robot from '@phosphor-icons/core/regular/robot.svg';
import XCircle from '@phosphor-icons/core/regular/x-circle.svg';
import type { CodingEvent } from '@service-cognition/generated/schemas/codingEvent';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { Tool } from './Tool';

/** Renders the live feed of a sandboxed coding-agent session. */
export function CodingSession(props: { events: CodingEvent[] }) {
  // The latest plan (sent whenever it changes) is shown once at the top.
  const latestPlan = () => {
    let plan: Extract<CodingEvent, { type: 'plan' }> | undefined;
    for (const e of props.events) if (e.type === 'plan') plan = e;
    return plan;
  };

  // The terminal event, if the session has finished.
  const finished = () =>
    props.events.find((e) => e.type === 'finished') as
      | Extract<CodingEvent, { type: 'finished' }>
      | undefined;

  // Everything rendered as an ordered feed (plans are pulled out above).
  const feed = () => props.events.filter((e) => e.type !== 'plan');

  return (
    <Tool.Root>
      <Tool.Row icon={Robot}>
        <span class="font-medium">Coding agent</span>
      </Tool.Row>
      <Tool.Response>
        <div class="flex flex-col gap-2">
          <Show when={latestPlan()}>
            {(plan) => (
              <div class="flex flex-col gap-1">
                <For each={plan().entries}>
                  {(entry) => (
                    <div class="flex items-center gap-2">
                      <Switch fallback={<Circle class="size-3.5 shrink-0" />}>
                        <Match when={entry.status === 'completed'}>
                          <CheckCircle class="text-ink size-3.5 shrink-0" />
                        </Match>
                        <Match when={entry.status === 'in_progress'}>
                          <CircleNotch class="size-3.5 shrink-0 animate-spin" />
                        </Match>
                      </Switch>
                      <span
                        classList={{
                          'line-through opacity-60': entry.status === 'completed',
                        }}
                      >
                        {entry.content}
                      </span>
                    </div>
                  )}
                </For>
              </div>
            )}
          </Show>

          <For each={feed()}>{(event) => <CodingEventRow event={event} />}</For>

          <Show when={finished()}>
            {(fin) => (
              <div class="flex flex-col gap-1 border-t border-edge-muted pt-2">
                <span>{fin().summary}</span>
                <Show when={fin().pr}>
                  {(pr) => (
                    <a
                      href={pr().url}
                      target="_blank"
                      rel="noreferrer"
                      class="text-ink hover:underline inline-flex items-center gap-1.5"
                    >
                      <GitPullRequest class="size-4" />
                      Pull request #{pr().number}
                    </a>
                  )}
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Tool.Response>
    </Tool.Root>
  );
}

function StatusIcon(props: { status: string }) {
  return (
    <Switch fallback={<Circle class="size-3.5 shrink-0" />}>
      <Match when={props.status === 'completed'}>
        <CheckCircle class="size-3.5 shrink-0" />
      </Match>
      <Match when={props.status === 'in_progress' || props.status === 'pending'}>
        <CircleNotch class="size-3.5 shrink-0 animate-spin" />
      </Match>
      <Match when={props.status === 'failed'}>
        <XCircle class="text-ink-error size-3.5 shrink-0" />
      </Match>
    </Switch>
  );
}

function CodingEventRow(props: { event: CodingEvent }) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <Switch>
      <Match when={props.event.type === 'session_started'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'session_started' }>;
          return (
            <span class="text-ink-extra-muted">
              Cloned {e.repo} · branch {e.branch}
            </span>
          );
        })()}
      </Match>
      <Match when={props.event.type === 'message'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'message' }>;
          return <ChatMessageMarkdown text={e.text} generating={() => false} />;
        })()}
      </Match>
      <Match when={props.event.type === 'thought'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'thought' }>;
          return <span class="text-ink-extra-muted italic">{e.text}</span>;
        })()}
      </Match>
      <Match when={props.event.type === 'tool_call'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'tool_call' }>;
          return (
            <div class="flex items-center gap-2">
              <StatusIcon status={e.status} />
              <span class="truncate">{e.title}</span>
            </div>
          );
        })()}
      </Match>
      <Match when={props.event.type === 'tool_update'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'tool_update' }>;
          return (
            <Show when={e.output}>
              <pre class="bg-background-secondary text-ink-muted ml-5 max-h-24 overflow-auto rounded p-2 font-mono text-xs whitespace-pre-wrap">
                {e.output}
              </pre>
            </Show>
          );
        })()}
      </Match>
      <Match when={props.event.type === 'diff'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'diff' }>;
          return (
            <div class="flex flex-col gap-1">
              <button
                type="button"
                class="text-ink-muted hover:text-ink flex items-center gap-2"
                onClick={() => setExpanded((v) => !v)}
              >
                <FileDiff class="size-3.5 shrink-0" />
                <span class="truncate font-mono text-xs">{e.path}</span>
              </button>
              <Show when={expanded()}>
                <pre class="bg-background-secondary max-h-80 overflow-auto rounded p-2 font-mono text-xs whitespace-pre-wrap">
                  {e.new_text}
                </pre>
              </Show>
            </div>
          );
        })()}
      </Match>
      <Match when={props.event.type === 'permission_request'}>
        {(() => {
          const e = props.event as Extract<
            CodingEvent,
            { type: 'permission_request' }
          >;
          return (
            <span class="text-ink-extra-muted">Permission: {e.title}</span>
          );
        })()}
      </Match>
      <Match when={props.event.type === 'error'}>
        {(() => {
          const e = props.event as Extract<CodingEvent, { type: 'error' }>;
          return <span class="text-ink-error">{e.message}</span>;
        })()}
      </Match>
    </Switch>
  );
}
