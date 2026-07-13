import { runCreateAction } from '@app/features/command/Launcher';
import { useRecentChatSessions } from '@app/features/home/home-recent-sessions';
import { useSplitPanelOrThrow } from '@components/app/split-layout/layoutUtils';
import { useChatInputContext } from '@core/component/AI/context';
import { EntityIcon } from '@core/component/EntityIcon';
import type { AutomationEntity } from '@entity';
import PlusIcon from '@phosphor/plus.svg';
import { useAutomationEntities } from '@queries/agent-schedule/entities';
import { cn, Tooltip } from '@ui';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  ErrorBoundary,
  For,
  type JSX,
  type ParentProps,
  Show,
  Suspense,
} from 'solid-js';

const RECENT_SESSIONS_LIMIT = 8;

/** A titled bento card in the Agents side panel. */
const Bento = (props: ParentProps<{ title: string; action?: JSX.Element }>) => (
  <section class="flex flex-col rounded-xl border border-edge-muted bg-active">
    <div class="flex items-center justify-between px-3 pt-2.5 pb-1.5">
      <span class="text-xs font-medium text-ink-muted">{props.title}</span>
      {props.action}
    </div>
    <div class="flex flex-col gap-0.5 px-1.5 pb-1.5">{props.children}</div>
  </section>
);

const BentoRow = (
  props: ParentProps<{ onClick: () => void; label: string }>
) => (
  <button
    type="button"
    aria-label={props.label}
    class="group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-hover"
    onClick={props.onClick}
  >
    {props.children}
  </button>
);

const BentoEmpty = (props: { message: string }) => (
  <div class="px-1.5 pb-1 text-xs text-ink-extra-muted">{props.message}</div>
);

const automationStatus = (automation: AutomationEntity) => {
  if (automation.isRunning) return 'Running…';
  if (!automation.enabled) return 'Paused';
  if (automation.nextRunAt) {
    return `Runs ${formatDistanceToNowStrict(new Date(automation.nextRunAt), {
      addSuffix: true,
    })}`;
  }
  return 'Scheduled';
};

const AutomationsBento = () => {
  const panel = useSplitPanelOrThrow();
  const automations = useAutomationEntities();

  const openAutomation = (id: string) => {
    panel.handle.replace({ next: { type: 'automation', id } });
  };

  return (
    <Bento
      title="Automations"
      action={
        <Tooltip label="New automation">
          <button
            type="button"
            aria-label="New automation"
            class="rounded-md p-1 text-ink-extra-muted transition-colors hover:bg-hover hover:text-ink-muted"
            onClick={() => runCreateAction('automation')}
          >
            <PlusIcon class="size-3.5" />
          </button>
        </Tooltip>
      }
    >
      <Show
        when={automations().length > 0}
        fallback={<BentoEmpty message="No automations yet." />}
      >
        <For each={automations()}>
          {(automation) => (
            <BentoRow
              label={`Open automation ${automation.name}`}
              onClick={() => openAutomation(automation.id)}
            >
              <span
                class={cn(
                  'size-1.5 shrink-0 rounded-full',
                  automation.isRunning
                    ? 'bg-success animate-pulse'
                    : automation.enabled
                      ? 'bg-accent'
                      : 'bg-ink/20'
                )}
              />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm text-ink">
                  {automation.name}
                </span>
                <span class="block truncate text-xs text-ink-extra-muted">
                  {automationStatus(automation)}
                </span>
              </span>
            </BentoRow>
          )}
        </For>
      </Show>
    </Bento>
  );
};

const SessionsBento = () => {
  const panel = useSplitPanelOrThrow();
  const sessions = useRecentChatSessions(RECENT_SESSIONS_LIMIT);

  const openChat = (id: string) => {
    panel.handle.replace({ next: { type: 'chat', id } });
  };

  return (
    <Bento title="Agents">
      <Show
        when={sessions().length > 0}
        fallback={<BentoEmpty message="No sessions yet — start one below." />}
      >
        <For each={sessions()}>
          {(session) => (
            <BentoRow
              label={`Open session ${session.name}`}
              onClick={() => openChat(session.id)}
            >
              <EntityIcon targetType="chat" size="xs" class="shrink-0" />
              <span class="min-w-0 flex-1 truncate text-sm text-ink">
                {session.name}
              </span>
              <Show when={session.updatedAt}>
                {(updatedAt) => (
                  <span class="shrink-0 text-xs tabular-nums text-ink-extra-muted">
                    {formatDistanceToNowStrict(updatedAt(), {
                      addSuffix: true,
                    })}
                  </span>
                )}
              </Show>
            </BentoRow>
          )}
        </For>
      </Show>
    </Bento>
  );
};

/**
 * Right-hand side panel of the Agents hub: a "New session" entry followed by
 * bento cards for automations and recent agent sessions.
 */
export const AgentsSidePanel = () => {
  const input = useChatInputContext();

  // Clearing the pending draft resets and focuses the hub composer — a
  // "new session" is just an empty composer ready for input.
  const startNewSession = () => input.setPendingDraft('');

  return (
    <aside class="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-edge-muted p-3">
      <button
        type="button"
        class="flex w-full items-center gap-2.5 rounded-xl border border-edge-muted bg-active px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:bg-hover"
        onClick={startNewSession}
      >
        <span class="flex size-5 items-center justify-center rounded-full bg-accent/10 text-accent">
          <PlusIcon class="size-3" />
        </span>
        New session
      </button>

      <ErrorBoundary fallback={() => null}>
        <Suspense fallback={null}>
          <AutomationsBento />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={() => null}>
        <Suspense fallback={null}>
          <SessionsBento />
        </Suspense>
      </ErrorBoundary>
    </aside>
  );
};
