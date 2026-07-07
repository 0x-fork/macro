import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { SidePanel } from '@app/component/side-panel';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { UserIcon } from '@core/component/UserIcon';
import {
  type EntityData,
  type GithubPullRequestEntity,
  getTaskStatusOptionId,
  type TaskEntity,
  type TaskEntityWithProperties,
} from '@entity';
import CaretRightIcon from '@phosphor/caret-right.svg';
import ChatCircleIcon from '@phosphor/chat-circle.svg';
import GitMergeIcon from '@phosphor/git-merge.svg';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import SparkleIcon from '@phosphor/sparkle.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import WarningCircleIcon from '@phosphor/warning-circle.svg';
import { useContacts } from '@queries/contacts/contacts';
import { useDocumentGithubPullRequestRefsQuery } from '@queries/storage/github-pull-requests';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { cn, EmptyStatePanel } from '@ui';
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  type JSX,
  Match,
  onCleanup,
  Show,
  Switch,
} from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import { DonutChart, DonutLegend, StatTile, ThroughputChart } from './charts';
import {
  useCodebasePullRequests,
  useCodebaseTasks,
  useProjectNames,
} from './data';
import {
  averageOpenAgeDays,
  buildEngineerBentos,
  computeNeedsAttention,
  computeWeeklyPrActivity,
  countStalePullRequests,
  countTasksByStatus,
  type EngineerBento,
  medianTimeToMergeDays,
  pullRequestDisplayStatus,
  UNASSIGNED_KEY,
} from './model';
import {
  useEngineerSummariesQuery,
  useTeamDailySummaryQuery,
} from './summaries';
import { formatDays, TASK_STATUS_SEGMENTS } from './widgets';

/** Entities shown per bento column before the "+N more" line. */
const BENTO_SECTION_LIMIT = 4;
/** Rows shown in the needs-attention card before expanding. */
const ATTENTION_LIMIT = 6;

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
  ref?: (el: HTMLButtonElement) => void;
  children: JSX.Element;
}) {
  return (
    <button
      type="button"
      ref={props.ref}
      class="flex w-full flex-col gap-1 rounded-lg bg-ink/3 px-2.5 py-2 text-left outline-none hover:bg-ink/6 focus-visible:ring focus-visible:ring-accent/40"
      onClick={(event) => props.onClick(event)}
    >
      {props.children}
    </button>
  );
}

/** Small chip appended to a mini-card's title row (e.g. "stale 12d"). */
function MetaChip(props: { class?: string; children: JSX.Element }) {
  return (
    <span
      class={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        props.class
      )}
    >
      {props.children}
    </span>
  );
}

function PullRequestMiniCard(props: {
  pullRequest: GithubPullRequestEntity;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
  chip?: JSX.Element;
  ref?: (el: HTMLButtonElement) => void;
}) {
  const meta = () => props.pullRequest.metadata;
  return (
    <MiniCard
      ref={props.ref}
      onClick={(event) => props.onOpen(props.pullRequest, event)}
    >
      <div class="flex w-full items-center gap-1.5">
        <PrStatusIcon pullRequest={props.pullRequest} />
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {meta().name}
        </span>
        {props.chip}
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
  chip?: JSX.Element;
  ref?: (el: HTMLButtonElement) => void;
  /** Reports the task's linked PR identifiers (record + external ids). */
  onLinks?: (taskId: string, linkedIds: string[]) => void;
}) {
  const refs = useDocumentGithubPullRequestRefsQuery(() => props.task.id);
  const linkedPullRequests = () => refs.data?.pullRequests ?? [];

  createEffect(() => {
    if (!props.onLinks || !refs.isSuccess) return;
    const ids: string[] = [];
    for (const ref of linkedPullRequests()) {
      if (ref.foreignEntityId) ids.push(ref.foreignEntityId);
      ids.push(ref.githubKey);
    }
    props.onLinks(props.task.id, ids);
  });

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
    <MiniCard
      ref={props.ref}
      onClick={(event) => props.onOpen(props.task, event)}
    >
      <div class="flex w-full items-center gap-1.5">
        <span
          class="size-2 shrink-0 rounded-full"
          style={{ 'background-color': statusColor() }}
        />
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {props.task.name}
        </span>
        <Show when={linkedPullRequests().length > 0}>
          <MetaChip class="bg-accent/10 text-accent">
            <GitPullRequestIcon class="size-3" />
            {linkedPullRequests().length}
            <span class="sr-only">linked pull requests</span>
          </MetaChip>
        </Show>
        {props.chip}
      </div>
      <Show when={props.projectName}>
        <div class="w-full truncate pl-3.5 text-[11px] text-ink-extra-muted">
          {props.projectName}
        </div>
      </Show>
    </MiniCard>
  );
}

/**
 * Collapsible AI digest of what the whole team got done in the last day.
 * Hidden when nothing happened; collapsed state is per-mount.
 */
function TeamDailySummary(props: {
  pullRequests: GithubPullRequestEntity[];
  tasks: TaskEntity[];
}) {
  const [open, setOpen] = createSignal(true);
  const summary = useTeamDailySummaryQuery(
    () => props.pullRequests,
    () => props.tasks
  );

  // fetchStatus distinguishes "disabled: no activity" from "loading".
  const idle = () => summary.fetchStatus === 'idle' && !summary.data;

  return (
    <Show when={!idle() && !summary.isError}>
      <section class="flex flex-col rounded-xl bg-surface/50 px-4 py-3 ring ring-edge-muted ring-inset">
        <button
          type="button"
          class="group flex w-full items-center gap-2 text-left outline-none"
          onClick={() => setOpen((prev) => !prev)}
        >
          <CaretRightIcon
            class={cn(
              'size-3 shrink-0 text-ink-muted transition-transform duration-90',
              open() && 'rotate-90'
            )}
          />
          <SparkleIcon class="size-3.5 shrink-0 text-accent" />
          <span class="text-[13px] font-semibold text-ink group-hover:underline">
            Daily digest
          </span>
          <span class="text-[11px] text-ink-extra-muted">last 24 hours</span>
        </button>
        <Show when={open()}>
          <div class="pt-2.5 pl-5">
            <Show
              when={summary.data}
              fallback={
                <div class="h-2 w-2/3 animate-pulse rounded-full bg-edge-muted/50" />
              }
            >
              {(bullets) => (
                <ul class="flex list-disc flex-col gap-1 pl-4 text-xs text-ink-muted marker:text-ink-extra-muted">
                  <For each={bullets()}>{(bullet) => <li>{bullet}</li>}</For>
                </ul>
              )}
            </Show>
          </div>
        </Show>
      </section>
    </Show>
  );
}

/**
 * The exceptions worth acting on: open PRs with failing checks, stale open
 * PRs, and tasks sitting in review. Renders above the bento list; the
 * overflow line expands the card in place.
 */
function NeedsAttentionCard(props: {
  pullRequests: GithubPullRequestEntity[];
  tasks: TaskEntity[];
  projectNames: Map<string, string>;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
}) {
  const [showAll, setShowAll] = createSignal(false);

  const attention = createMemo(() =>
    computeNeedsAttention(props.pullRequests, props.tasks)
  );

  const total = () =>
    attention().failingChecks.length +
    attention().stale.length +
    attention().inReviewTasks.length;

  const rows = createMemo((): JSX.Element[] => {
    const { failingChecks, stale, inReviewTasks } = attention();
    const items: JSX.Element[] = [];

    for (const pullRequest of failingChecks) {
      items.push(
        <PullRequestMiniCard
          pullRequest={pullRequest}
          onOpen={props.onOpen}
          chip={
            <MetaChip class="bg-failure/10 text-failure">
              <WarningCircleIcon class="size-3" />
              CI failing
            </MetaChip>
          }
        />
      );
    }
    for (const { pullRequest, quietDays } of stale) {
      items.push(
        <PullRequestMiniCard
          pullRequest={pullRequest}
          onOpen={props.onOpen}
          chip={
            <MetaChip class="bg-alert/15 text-alert-ink">
              stale {quietDays}d
            </MetaChip>
          }
        />
      );
    }
    for (const task of inReviewTasks) {
      items.push(
        <TaskMiniCard
          task={task}
          projectName={
            task.projectId ? props.projectNames.get(task.projectId) : undefined
          }
          onOpen={props.onOpen}
          chip={<MetaChip class="bg-accent/10 text-accent">in review</MetaChip>}
        />
      );
    }
    return items;
  });

  const visibleRows = () =>
    showAll() ? rows() : rows().slice(0, ATTENTION_LIMIT);

  return (
    <Show when={total() > 0}>
      <section class="flex flex-col gap-2.5 rounded-xl bg-surface/50 p-4 ring ring-edge-muted ring-inset">
        <header class="flex items-baseline gap-2">
          <h3 class="text-[13px] font-semibold text-ink">Needs attention</h3>
          <span class="text-[11px] text-ink-extra-muted tabular-nums">
            {attention().failingChecks.length} failing ·{' '}
            {attention().stale.length} stale ·{' '}
            {attention().inReviewTasks.length} in review
          </span>
        </header>
        <div class="grid grid-cols-1 gap-1.5 @3xl:grid-cols-2">
          <For each={visibleRows()}>{(row) => row}</For>
        </div>
        <Show when={total() > ATTENTION_LIMIT}>
          <button
            type="button"
            class="self-start text-[11px] text-ink-muted tabular-nums outline-none hover:text-ink"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll() ? 'Show less' : `+${total() - ATTENTION_LIMIT} more`}
          </button>
        </Show>
      </section>
    </Show>
  );
}

function ColumnLabel(props: { label: string; count: number }) {
  return (
    <span class="text-[10px] font-medium uppercase tracking-wider text-ink-extra-muted">
      {props.label}
      <span class="ml-1.5 normal-case tracking-normal tabular-nums">
        {props.count}
      </span>
    </span>
  );
}

function MoreButton(props: {
  hidden: number;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Show when={props.hidden > 0}>
      <button
        type="button"
        class="self-start text-[11px] text-ink-extra-muted tabular-nums outline-none hover:text-ink-muted"
        onClick={() => props.onClick?.()}
      >
        +{props.hidden} more {props.label}
      </button>
    </Show>
  );
}

type ConnectorPath = { d: string; endX: number; endY: number };

/**
 * One row per engineer: tasks on the left, PRs on the right, with curved
 * connectors drawn between a task card and the PR cards it links to
 * (measured from the DOM, redrawn on resize).
 */
function EngineerBentoCard(props: {
  bento: EngineerBento;
  projectNames: Map<string, string>;
  summary?: string;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
  onShowPullRequests: () => void;
  onShowTasks: () => void;
}) {
  const uid = createUniqueId();
  const isUnassigned = () => props.bento.key === UNASSIGNED_KEY;

  const visibleTasks = () =>
    props.bento.openTasks.slice(0, BENTO_SECTION_LIMIT);
  const visiblePullRequests = () =>
    props.bento.openPullRequests.slice(0, BENTO_SECTION_LIMIT);
  const hasBoth = () =>
    visibleTasks().length > 0 && visiblePullRequests().length > 0;

  // task id -> linked PR record/external ids, reported by each task card.
  const [links, setLinks] = createSignal<Record<string, string[]>>({});
  const reportLinks = (taskId: string, linkedIds: string[]) => {
    setLinks((prev) => ({ ...prev, [taskId]: linkedIds }));
  };

  let containerEl: HTMLDivElement | undefined;
  const taskEls = new Map<string, HTMLElement>();
  const prEls = new Map<string, HTMLElement>();
  const [layoutVersion, setLayoutVersion] = createSignal(0);
  const bumpLayout = () => setLayoutVersion((v) => v + 1);

  const registerContainer = (el: HTMLDivElement) => {
    containerEl = el;
    const observer = new ResizeObserver(bumpLayout);
    observer.observe(el);
    onCleanup(() => observer.disconnect());
  };

  const paths = createMemo((): ConnectorPath[] => {
    layoutVersion();
    const linkMap = links();
    const container = containerEl;
    if (!container) return [];
    const containerRect = container.getBoundingClientRect();

    // Match linked ids against visible PRs by record id or external key.
    const prIdFor = new Map<string, string>();
    for (const pullRequest of visiblePullRequests()) {
      prIdFor.set(pullRequest.id, pullRequest.id);
      prIdFor.set(pullRequest.foreignId, pullRequest.id);
    }

    const result: ConnectorPath[] = [];
    for (const task of visibleTasks()) {
      const taskEl = taskEls.get(task.id);
      const linkedIds = linkMap[task.id];
      if (!taskEl || !linkedIds?.length) continue;

      const targets = new Set<string>();
      for (const linkedId of linkedIds) {
        const prId = prIdFor.get(linkedId);
        if (prId) targets.add(prId);
      }

      for (const prId of targets) {
        const prEl = prEls.get(prId);
        if (!prEl) continue;
        const taskRect = taskEl.getBoundingClientRect();
        const prRect = prEl.getBoundingClientRect();
        const startX = taskRect.right - containerRect.left + 2;
        const startY = taskRect.top + taskRect.height / 2 - containerRect.top;
        const endX = prRect.left - containerRect.left - 7;
        const endY = prRect.top + prRect.height / 2 - containerRect.top;
        const bend = Math.max(16, (endX - startX) * 0.45);
        result.push({
          d: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
          endX,
          endY,
        });
      }
    }
    return result;
  });

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

      <Show when={props.summary}>
        <div class="-mt-1 flex items-start gap-1.5 text-xs text-ink-muted">
          <SparkleIcon class="mt-0.5 size-3 shrink-0 text-accent/70" />
          <span class="min-w-0">{props.summary}</span>
        </div>
      </Show>

      <Show
        when={
          props.bento.openTasks.length > 0 ||
          props.bento.openPullRequests.length > 0
        }
        fallback={
          <div class="text-xs text-ink-muted">
            Nothing open — {props.bento.mergedLast30Days} PRs merged in the last
            30 days.
          </div>
        }
      >
        <div
          ref={registerContainer}
          class={cn(
            'relative grid gap-x-14 gap-y-1.5',
            hasBoth() ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          {/* Task → PR connectors, drawn across the gutter */}
          <Show when={paths().length > 0}>
            <svg
              class="pointer-events-none absolute inset-0 z-[1] size-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id={`arrow-${uid}`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 1 1 L 7 4 L 1 7"
                    fill="none"
                    stroke="var(--color-ink-extra-muted)"
                    stroke-width="1.25"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </marker>
              </defs>
              <For each={paths()}>
                {(path) => (
                  <path
                    d={path.d}
                    fill="none"
                    stroke="var(--color-ink-extra-muted)"
                    stroke-width={1.25}
                    opacity={0.6}
                    marker-end={`url(#arrow-${uid})`}
                  />
                )}
              </For>
            </svg>
          </Show>

          <Show when={props.bento.openTasks.length > 0}>
            <div class="flex min-w-0 flex-col gap-1.5">
              <ColumnLabel label="Tasks" count={props.bento.openTasks.length} />
              <For each={visibleTasks()}>
                {(task) => (
                  <TaskMiniCard
                    task={task}
                    projectName={
                      task.projectId
                        ? props.projectNames.get(task.projectId)
                        : undefined
                    }
                    onOpen={props.onOpen}
                    onLinks={reportLinks}
                    ref={(el) => {
                      taskEls.set(task.id, el);
                      bumpLayout();
                    }}
                  />
                )}
              </For>
              <MoreButton
                hidden={props.bento.openTasks.length - visibleTasks().length}
                label="tasks"
                onClick={props.onShowTasks}
              />
            </div>
          </Show>

          <Show when={props.bento.openPullRequests.length > 0}>
            <div class="flex min-w-0 flex-col gap-1.5">
              <ColumnLabel
                label="Pull requests"
                count={props.bento.openPullRequests.length}
              />
              <For each={visiblePullRequests()}>
                {(pullRequest) => (
                  <PullRequestMiniCard
                    pullRequest={pullRequest}
                    onOpen={props.onOpen}
                    ref={(el) => {
                      prEls.set(pullRequest.id, el);
                      bumpLayout();
                    }}
                  />
                )}
              </For>
              <MoreButton
                hidden={
                  props.bento.openPullRequests.length -
                  visiblePullRequests().length
                }
                label="pull requests"
                onClick={props.onShowPullRequests}
              />
            </div>
          </Show>
        </div>
      </Show>
    </section>
  );
}

/** Key insight charts + metrics, docked in the entity-style side panel. */
function InsightsRail(props: {
  pullRequests: GithubPullRequestEntity[];
  tasks: TaskEntity[];
}) {
  const weeklyActivity = createMemo(() =>
    computeWeeklyPrActivity(props.pullRequests)
  );
  const taskSegments = createMemo(() => {
    const counts = countTasksByStatus(props.tasks);
    return TASK_STATUS_SEGMENTS.map((segment) => ({
      ...segment,
      count: counts.get(segment.key) ?? 0,
    }));
  });
  const openTaskCount = createMemo(
    () => props.tasks.filter((task) => !task.subType.is_completed).length
  );
  const openPrCount = createMemo(
    () =>
      props.pullRequests.filter((pullRequest) => {
        const status = pullRequestDisplayStatus(pullRequest);
        return status === 'open' || status === 'draft';
      }).length
  );

  return (
    <>
      <SidePanel.Section
        id="codebase-throughput"
        title="Throughput"
        defaultOpen
        order={1}
      >
        <ThroughputChart data={weeklyActivity()} />
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-key-metrics"
        title="Key metrics"
        defaultOpen
        order={2}
      >
        <div class="grid grid-cols-2 gap-2 py-1">
          <StatTile label="Open PRs" value={openPrCount()} />
          <StatTile
            label="Avg open duration"
            value={formatDays(averageOpenAgeDays(props.pullRequests))}
          />
          <StatTile
            label="Median time to merge"
            value={formatDays(medianTimeToMergeDays(props.pullRequests))}
            detail="last 30 days"
          />
          <StatTile
            label="Stale PRs"
            value={countStalePullRequests(props.pullRequests)}
            detail="quiet for 7+ days"
          />
        </div>
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-task-statuses"
        title="Task statuses"
        defaultOpen
        order={3}
      >
        <div class="flex flex-col items-center gap-3 py-1">
          <DonutChart
            segments={taskSegments()}
            centerValue={openTaskCount()}
            centerCaption="open tasks"
            ariaLabel="Tasks by status"
          />
          <DonutLegend segments={taskSegments()} />
        </div>
      </SidePanel.Section>
    </>
  );
}

/**
 * The Overview tab: one bento row per engineer with tasks and PRs side by
 * side (linked by connector arrows), an exceptions card up top, and key
 * insight charts docked in the entity-style right side panel. Scoped to the
 * current team's members when the user belongs to a team.
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
  const team = useCurrentTeamQuery();

  const teamMemberIds = createMemo(() => {
    const members = team.data?.members;
    return members?.length
      ? new Set(members.map((member) => member.user_id))
      : undefined;
  });

  const bentos = createMemo(() =>
    buildEngineerBentos(pullRequests(), tasks(), contacts(), {
      teamMemberIds: teamMemberIds(),
    })
  );

  const engineerSummaries = useEngineerSummariesQuery(bentos, pullRequests);

  const openEntity = (entity: EntityData, event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      openInNewSplit: event.metaKey || event.ctrlKey,
      referredFrom: 'codebase',
    });
  };

  return (
    <div class="min-h-0 flex-1">
      <SidePanel.Layout>
        <div class="size-full min-h-0 overflow-y-auto @container">
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
              <div class="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4">
                <TeamDailySummary
                  pullRequests={pullRequests()}
                  tasks={tasks()}
                />
                <NeedsAttentionCard
                  pullRequests={pullRequests()}
                  tasks={tasks()}
                  projectNames={projectNames()}
                  onOpen={openEntity}
                />
                <For each={bentos()}>
                  {(bento) => (
                    <EngineerBentoCard
                      bento={bento}
                      projectNames={projectNames()}
                      summary={engineerSummaries.data?.get(bento.key)}
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

        <InsightsRail pullRequests={pullRequests()} tasks={tasks()} />
      </SidePanel.Layout>
    </div>
  );
}
