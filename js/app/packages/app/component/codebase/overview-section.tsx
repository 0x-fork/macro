import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { UserIcon } from '@core/component/UserIcon';
import {
  type EntityData,
  type GithubPullRequestEntity,
  getTaskStatusOptionId,
  type TaskEntity,
  type TaskEntityWithProperties,
} from '@entity';
import ChatCircleIcon from '@phosphor/chat-circle.svg';
import GitMergeIcon from '@phosphor/git-merge.svg';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import { useContacts } from '@queries/contacts/contacts';
import { cn, EmptyStatePanel } from '@ui';
import { createMemo, For, type JSX, Match, Show, Switch } from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import {
  useCodebasePullRequests,
  useCodebaseTasks,
  useProjectNames,
} from './data';
import {
  buildEngineerBentos,
  type EngineerBento,
  pullRequestDisplayStatus,
  UNASSIGNED_KEY,
} from './model';
import { TASK_STATUS_SEGMENTS } from './widgets';

/** Entities shown per section of a bento before the "+N more" line. */
const BENTO_SECTION_LIMIT = 4;

const NUMBER_FORMAT = new Intl.NumberFormat();

const TASK_STATUS_COLORS = new Map<string, string>(
  TASK_STATUS_SEGMENTS.map((segment) => [segment.key, segment.color])
);

function PrStatusIcon(props: { pullRequest: GithubPullRequestEntity }) {
  const status = () => pullRequestDisplayStatus(props.pullRequest);
  return (
    <Switch>
      <Match when={status() === 'merged'}>
        <GitMergeIcon class="size-3.5 shrink-0 text-accent" />
      </Match>
      <Match when={status() === 'draft'}>
        <GitPullRequestIcon class="size-3.5 shrink-0 text-ink-placeholder" />
      </Match>
      <Match when={status() === 'closed'}>
        <GitPullRequestIcon class="size-3.5 shrink-0 text-failure" />
      </Match>
      <Match when={true}>
        <GitPullRequestIcon class="size-3.5 shrink-0 text-success" />
      </Match>
    </Switch>
  );
}

function MiniCard(props: {
  onClick: (event: MouseEvent) => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      class="flex w-full flex-col gap-1 rounded-lg bg-ink/3 px-2.5 py-2 text-left outline-none hover:bg-ink/6 focus-visible:ring focus-visible:ring-accent/40"
      onClick={(event) => props.onClick(event)}
    >
      {props.children}
    </button>
  );
}

function PullRequestMiniCard(props: {
  pullRequest: GithubPullRequestEntity;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
}) {
  const meta = () => props.pullRequest.metadata;
  return (
    <MiniCard onClick={(event) => props.onOpen(props.pullRequest, event)}>
      <div class="flex w-full items-center gap-1.5">
        <PrStatusIcon pullRequest={props.pullRequest} />
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {meta().name}
        </span>
      </div>
      <div class="flex w-full items-center gap-2 pl-5 text-[11px] text-ink-extra-muted tabular-nums">
        <span class="truncate">
          {meta().repo}#{meta().number}
        </span>
        <span class="shrink-0 text-success/80">
          +{NUMBER_FORMAT.format(meta().additions)}
        </span>
        <span class="shrink-0 text-failure/80">
          −{NUMBER_FORMAT.format(meta().deletions)}
        </span>
        <Show when={meta().comments.length > 0}>
          <span class="inline-flex shrink-0 items-center gap-0.5">
            <ChatCircleIcon class="size-3" />
            {meta().comments.length}
          </span>
        </Show>
      </div>
    </MiniCard>
  );
}

function TaskMiniCard(props: {
  task: TaskEntity;
  projectName?: string;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
}) {
  const statusColor = () => {
    const statusId = getTaskStatusOptionId(
      props.task as TaskEntityWithProperties
    );
    return (
      (statusId && TASK_STATUS_COLORS.get(statusId)) ??
      'var(--color-ink-placeholder)'
    );
  };

  return (
    <MiniCard onClick={(event) => props.onOpen(props.task, event)}>
      <div class="flex w-full items-center gap-1.5">
        <span
          class="size-2 shrink-0 rounded-full"
          style={{ 'background-color': statusColor() }}
        />
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {props.task.name}
        </span>
      </div>
      <Show when={props.projectName}>
        <div class="w-full truncate pl-3.5 text-[11px] text-ink-extra-muted">
          {props.projectName}
        </div>
      </Show>
    </MiniCard>
  );
}

function BentoSection(props: {
  label: string;
  count: number;
  moreLabel: string;
  onMore?: () => void;
  children: JSX.Element;
}) {
  const hidden = () => Math.max(0, props.count - BENTO_SECTION_LIMIT);
  return (
    <div class="flex flex-col gap-1.5">
      <span class="text-[10px] font-medium uppercase tracking-wider text-ink-extra-muted">
        {props.label}
        <span class="ml-1.5 normal-case tracking-normal tabular-nums">
          {props.count}
        </span>
      </span>
      {props.children}
      <Show when={hidden() > 0}>
        <button
          type="button"
          class="self-start text-[11px] text-ink-extra-muted tabular-nums outline-none hover:text-ink-muted"
          onClick={() => props.onMore?.()}
        >
          +{hidden()} more {props.moreLabel}
        </button>
      </Show>
    </div>
  );
}

function EngineerBentoCard(props: {
  bento: EngineerBento;
  projectNames: Map<string, string>;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
  onShowPullRequests: () => void;
  onShowTasks: () => void;
}) {
  const isUnassigned = () => props.bento.key === UNASSIGNED_KEY;

  return (
    <section class="flex flex-col gap-3 rounded-xl bg-surface/50 p-4 ring ring-edge-muted ring-inset">
      <header class="flex items-center gap-2.5">
        <Switch
          fallback={
            <AuthorAvatar
              login={props.bento.githubLogin}
              class="size-6 shrink-0"
            />
          }
        >
          <Match when={isUnassigned()}>
            <span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-ink-muted">
              <UsersThreeIcon class="size-3.5" />
            </span>
          </Match>
          <Match when={!props.bento.githubLogin && props.bento.userId}>
            {(userId) => (
              <div class="size-6 shrink-0">
                <UserIcon
                  id={userId()}
                  size="fill"
                  suppressClick
                  showTooltip={false}
                />
              </div>
            )}
          </Match>
        </Switch>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold text-ink">
            {props.bento.displayName}
          </div>
          <div class="truncate text-[11px] text-ink-extra-muted tabular-nums">
            {props.bento.openPullRequests.length} open PRs ·{' '}
            {props.bento.openTasks.length} tasks
            <Show when={props.bento.mergedLast30Days > 0}>
              {' '}
              · {props.bento.mergedLast30Days} merged / 30d
            </Show>
          </div>
        </div>
      </header>

      <Show when={props.bento.openPullRequests.length > 0}>
        <BentoSection
          label="Pull requests"
          count={props.bento.openPullRequests.length}
          moreLabel="pull requests"
          onMore={props.onShowPullRequests}
        >
          <For
            each={props.bento.openPullRequests.slice(0, BENTO_SECTION_LIMIT)}
          >
            {(pullRequest) => (
              <PullRequestMiniCard
                pullRequest={pullRequest}
                onOpen={props.onOpen}
              />
            )}
          </For>
        </BentoSection>
      </Show>

      <Show when={props.bento.openTasks.length > 0}>
        <BentoSection
          label="Tasks"
          count={props.bento.openTasks.length}
          moreLabel="tasks"
          onMore={props.onShowTasks}
        >
          <For each={props.bento.openTasks.slice(0, BENTO_SECTION_LIMIT)}>
            {(task) => (
              <TaskMiniCard
                task={task}
                projectName={
                  task.projectId
                    ? props.projectNames.get(task.projectId)
                    : undefined
                }
                onOpen={props.onOpen}
              />
            )}
          </For>
        </BentoSection>
      </Show>

      <Show
        when={
          props.bento.openPullRequests.length === 0 &&
          props.bento.openTasks.length === 0
        }
      >
        <div class="text-xs text-ink-muted">
          Nothing open — {props.bento.mergedLast30Days} PRs merged in the last
          30 days.
        </div>
      </Show>
    </section>
  );
}

/**
 * The Overview tab: a bento grid with one card per engineer, combining their
 * open pull requests (by GitHub author) and open tasks (by assignee, matched
 * to the PR author heuristically — see `matchContactForLogin`).
 */
export function OverviewSection(props: {
  onShowPullRequests: () => void;
  onShowTasks: () => void;
}) {
  const panel = useSplitPanelOrThrow();
  const { query: prQuery, pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();
  const projectNames = useProjectNames();
  const contacts = useContacts();

  const bentos = createMemo(() =>
    buildEngineerBentos(pullRequests(), tasks(), contacts())
  );

  const openEntity = (entity: EntityData, event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      openInNewSplit: event.metaKey || event.ctrlKey,
      referredFrom: 'codebase',
    });
  };

  return (
    <div class="min-h-0 flex-1 overflow-y-auto @container">
      <Switch>
        <Match when={prQuery.isLoading && bentos().length === 0}>
          <div class="px-6 py-6 text-sm text-ink-muted">Loading team…</div>
        </Match>
        <Match when={bentos().length === 0}>
          <EmptyStatePanel
            centered
            graphic={UsersThreeIcon}
            graphicClass="h-24 w-24 text-ink-extra-muted"
            title="No activity yet"
            description="Open pull requests and tasks will show up here, one card per engineer."
          />
        </Match>
        <Match when={true}>
          <div
            class={cn(
              'grid w-full items-start gap-3 px-4 py-4',
              'grid-cols-1 @2xl:grid-cols-2 @5xl:grid-cols-3'
            )}
          >
            <For each={bentos()}>
              {(bento) => (
                <EngineerBentoCard
                  bento={bento}
                  projectNames={projectNames()}
                  onOpen={openEntity}
                  onShowPullRequests={props.onShowPullRequests}
                  onShowTasks={props.onShowTasks}
                />
              )}
            </For>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
