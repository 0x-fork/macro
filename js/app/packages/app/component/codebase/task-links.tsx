import {
  type GithubPullRequestEntity,
  getTaskStatusOptionId,
  type TaskEntity,
  type TaskEntityWithProperties,
} from '@entity';
import { useDocumentGithubPullRequestRefsQuery } from '@queries/storage/github-pull-requests';
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
} from 'solid-js';
import { pullRequestGithubKey } from './model';
import { TASK_STATUS_SEGMENTS } from './widgets';

/**
 * Task↔PR link plumbing shared by the overview and the pull requests tab:
 * null-rendering collectors fan the per-task stored-refs query out, and the
 * index resolves a PR row's linked tasks via the `owner/repo/pull/number`
 * key (with record/external-id fallbacks).
 */

const TASK_STATUS_COLORS = new Map<string, string>(
  TASK_STATUS_SEGMENTS.map((segment) => [segment.key, segment.color])
);

export function taskStatusColor(task: TaskEntity): string {
  const statusId = getTaskStatusOptionId(task as TaskEntityWithProperties);
  return (
    (statusId && TASK_STATUS_COLORS.get(statusId)) ??
    'var(--color-ink-placeholder)'
  );
}

/** Fetches one task's stored PR associations and reports them up. */
function TaskLinkCollector(props: {
  task: TaskEntity;
  onLinks: (taskId: string, linkedIds: string[]) => void;
}) {
  const refs = useDocumentGithubPullRequestRefsQuery(() => props.task.id);

  createEffect(() => {
    if (!refs.isSuccess) return;
    const ids: string[] = [];
    for (const ref of refs.data.pullRequests) {
      ids.push(ref.githubKey);
      if (ref.foreignEntityId) ids.push(ref.foreignEntityId);
    }
    props.onLinks(props.task.id, ids);
  });

  return null;
}

export type TaskLinkIndex = {
  /** Render inside the view; fans out the per-task refs queries. */
  Collectors: () => JSX.Element;
  /** Open tasks linked to the given PR. */
  tasksFor: (pullRequest: GithubPullRequestEntity) => TaskEntity[];
};

/** Builds the PR→tasks index over the given (open) tasks. */
export function createTaskLinkIndex(tasks: () => TaskEntity[]): TaskLinkIndex {
  const [links, setLinks] = createSignal<Record<string, string[]>>({});
  const reportLinks = (taskId: string, linkedIds: string[]) => {
    setLinks((prev) => ({ ...prev, [taskId]: linkedIds }));
  };

  /** Linked id (github key, record id, or external id) -> tasks. */
  const tasksByLinkedId = createMemo(() => {
    const tasksById = new Map(tasks().map((task) => [task.id, task]));
    const map = new Map<string, TaskEntity[]>();
    for (const [taskId, linkedIds] of Object.entries(links())) {
      const task = tasksById.get(taskId);
      if (!task) continue;
      for (const linkedId of linkedIds) {
        const list = map.get(linkedId) ?? [];
        if (!list.includes(task)) list.push(task);
        map.set(linkedId, list);
      }
    }
    return map;
  });

  const tasksFor = (pullRequest: GithubPullRequestEntity): TaskEntity[] => {
    const index = tasksByLinkedId();
    const matches = [
      ...(index.get(pullRequestGithubKey(pullRequest)) ?? []),
      ...(index.get(pullRequest.id) ?? []),
      ...(index.get(pullRequest.foreignId) ?? []),
    ];
    return [...new Set(matches)];
  };

  const Collectors = () => (
    <For each={tasks()}>
      {(task) => <TaskLinkCollector task={task} onLinks={reportLinks} />}
    </For>
  );

  return { Collectors, tasksFor };
}

/** Linked-task pill shown at the right of a PR row. */
export function TaskPill(props: {
  task: TaskEntity;
  onOpen: (task: TaskEntity, event: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      title={props.task.name}
      class="inline-flex max-w-44 min-w-0 items-center gap-1.5 rounded-full bg-surface/50 px-2 py-1 text-xs text-ink ring ring-edge-muted ring-inset outline-none hover:bg-ink/5 focus-visible:ring-accent/40"
      onClick={(event) => {
        event.stopPropagation();
        props.onOpen(props.task, event);
      }}
    >
      <span
        class="size-2 shrink-0 rounded-full"
        style={{ 'background-color': taskStatusColor(props.task) }}
      />
      <span class="truncate">{props.task.name}</span>
    </button>
  );
}

/** PR row wrapper: unified-list row on the left, linked-task pills right. */
export function PullRequestRowWithTasks(props: {
  linked: TaskEntity[];
  pillLimit: number;
  onOpenTask: (task: TaskEntity, event: MouseEvent) => void;
  children: JSX.Element;
}) {
  return (
    <div class="flex items-center gap-2">
      <div class="min-w-0 flex-1">{props.children}</div>
      {props.linked.length > 0 && (
        <div class="flex shrink-0 items-center gap-1.5 pr-2">
          <For each={props.linked.slice(0, props.pillLimit)}>
            {(task) => <TaskPill task={task} onOpen={props.onOpenTask} />}
          </For>
          {props.linked.length > props.pillLimit && (
            <span class="text-[11px] text-ink-extra-muted tabular-nums">
              +{props.linked.length - props.pillLimit}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
