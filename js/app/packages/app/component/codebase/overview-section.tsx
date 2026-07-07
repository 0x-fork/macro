import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { SidePanel } from '@app/component/side-panel';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import {
  type EntityData,
  type GithubPullRequestEntity,
  ListEntity,
  ListLayoutProvider,
  type TaskEntity,
} from '@entity';
import CaretRightIcon from '@phosphor/caret-right.svg';
import ChatCircleIcon from '@phosphor/chat-circle.svg';
import GitMergeIcon from '@phosphor/git-merge.svg';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import SparkleIcon from '@phosphor/sparkle.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import WarningCircleIcon from '@phosphor/warning-circle.svg';
import { useGithubLinkStatusQuery } from '@queries/auth/github-link';
import { useContacts } from '@queries/contacts/contacts';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { cn, EmptyStatePanel } from '@ui';
import {
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  Show,
  Switch,
} from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import { DonutChart, DonutLegend, StatTile, ThroughputChart } from './charts';
import {
  ConnectGithubOverview,
  ConnectGithubRailSections,
} from './connect-github';
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
  groupPullRequestsByAuthor,
  medianTimeToMergeDays,
  type PullRequestAuthorGroup,
  pullRequestDisplayStatus,
  UNKNOWN_AUTHOR_KEY,
} from './model';
import {
  useEngineerSummariesQuery,
  useTeamDailySummaryQuery,
} from './summaries';
import {
  createTaskLinkIndex,
  PullRequestRowWithTasks,
  taskStatusColor,
} from './task-links';
import { formatDays, TASK_STATUS_SEGMENTS } from './widgets';

/** Rows shown in the needs-attention card before expanding. */
const ATTENTION_LIMIT = 6;
/** Linked-task pills shown per PR row. */
const TASK_PILL_LIMIT = 2;

const NUMBER_FORMAT = new Intl.NumberFormat();

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
}) {
  const meta = () => props.pullRequest.metadata;
  return (
    <MiniCard onClick={(event) => props.onOpen(props.pullRequest, event)}>
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
}) {
  return (
    <MiniCard onClick={(event) => props.onOpen(props.task, event)}>
      <div class="flex w-full items-center gap-1.5">
        <span
          class="size-2 shrink-0 rounded-full"
          style={{ 'background-color': taskStatusColor(props.task) }}
        />
        <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
          {props.task.name}
        </span>
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
 * PRs, and tasks sitting in review. Collapsible; the overflow line expands
 * the row list in place.
 */
function NeedsAttentionCard(props: {
  pullRequests: GithubPullRequestEntity[];
  tasks: TaskEntity[];
  projectNames: Map<string, string>;
  onOpen: (entity: EntityData, event: MouseEvent) => void;
}) {
  const [open, setOpen] = createSignal(true);
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
          <span class="text-[13px] font-semibold text-ink group-hover:underline">
            Needs attention
          </span>
          <span class="text-[11px] text-ink-extra-muted tabular-nums">
            {attention().failingChecks.length} failing ·{' '}
            {attention().stale.length} stale ·{' '}
            {attention().inReviewTasks.length} in review
          </span>
        </button>
        <Show when={open()}>
          <div class="flex flex-col gap-2.5 pt-2.5">
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
          </div>
        </Show>
      </section>
    </Show>
  );
}

function AuthorGroupHeader(props: {
  group: PullRequestAuthorGroup;
  summary?: string;
}) {
  return (
    <div class="flex flex-col gap-1 px-3 pt-4 pb-1.5">
      <div class="flex items-center gap-2">
        <AuthorAvatar login={props.group.authorLogin} class="size-5 shrink-0" />
        <span class="text-sm font-semibold text-ink">
          {props.group.authorLogin ?? 'Unknown author'}
        </span>
        <span class="text-xs text-ink-extra-muted tabular-nums">
          {props.group.openCount} open
        </span>
      </div>
      <Show when={props.summary}>
        <div class="flex items-start gap-1.5 pl-7 text-xs text-ink-muted">
          <SparkleIcon class="mt-0.5 size-3 shrink-0 text-accent/70" />
          <span class="min-w-0">{props.summary}</span>
        </div>
      </Show>
    </div>
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
 * The Overview tab: the team's open pull requests as a unified list grouped
 * by author (with an AI summary per engineer), linked-task pills on the
 * right of each row, a collapsible daily digest and needs-attention card up
 * top, and key insight charts docked in the entity-style right side panel.
 * Scoped to the current team's members when the user belongs to a team.
 */
export function OverviewSection() {
  const panel = useSplitPanelOrThrow();
  const githubLink = useGithubLinkStatusQuery();
  const { query: prQuery, pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();
  const projectNames = useProjectNames();
  const contacts = useContacts();
  const team = useCurrentTeamQuery();

  const githubDisconnected = () =>
    githubLink.isSuccess && githubLink.data?.status !== 'linked';

  const teamMemberIds = createMemo(() => {
    const members = team.data?.members;
    return members?.length
      ? new Set(members.map((member) => member.user_id))
      : undefined;
  });

  const openPullRequests = createMemo(() =>
    pullRequests().filter((pullRequest) => {
      const status = pullRequestDisplayStatus(pullRequest);
      return status === 'open' || status === 'draft';
    })
  );

  const groups = createMemo(() =>
    groupPullRequestsByAuthor(openPullRequests())
  );

  const openTasks = createMemo(() =>
    tasks().filter((task) => !task.subType.is_completed)
  );

  // Per-engineer AI summaries, keyed by author login (bentos exist purely to
  // feed the digest builder and reuse its team scoping).
  const bentos = createMemo(() =>
    buildEngineerBentos(pullRequests(), tasks(), contacts(), {
      teamMemberIds: teamMemberIds(),
    })
  );
  const engineerSummaries = useEngineerSummariesQuery(bentos, pullRequests);

  const taskLinks = createTaskLinkIndex(openTasks);

  const openInCurrentSplit = (entity: EntityData, event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(entity, {
      splitHandle: panel.handle,
      openInNewSplit: event.metaKey || event.ctrlKey,
      referredFrom: 'codebase',
    });
  };

  const openTaskInNewSplit = (task: TaskEntity, _event: MouseEvent) => {
    void openEntityInSplitFromUnifiedList(task, {
      splitHandle: panel.handle,
      openInNewSplit: true,
      referredFrom: 'codebase',
    });
  };

  let listRef: HTMLDivElement | undefined;

  return (
    <div class="min-h-0 flex-1">
      <SidePanel.Layout>
        <div class="size-full min-h-0 overflow-y-auto @container">
          {/* Null-rendering collectors feed the PR→task pill mapping. */}
          <taskLinks.Collectors />

          <Switch>
            <Match when={githubDisconnected()}>
              <ConnectGithubOverview />
            </Match>
            <Match when={prQuery.isLoading && groups().length === 0}>
              <div class="px-6 py-6 text-sm text-ink-muted">Loading team…</div>
            </Match>
            <Match when={groups().length === 0}>
              <EmptyStatePanel
                centered
                graphic={UsersThreeIcon}
                graphicClass="h-24 w-24 text-ink-extra-muted"
                title="No open pull requests"
                description="Your team's open pull requests will show up here, grouped by engineer."
              />
            </Match>
            <Match when={true}>
              <div class="flex w-full flex-col gap-3 px-4 py-4">
                <TeamDailySummary
                  pullRequests={pullRequests()}
                  tasks={tasks()}
                />
                <NeedsAttentionCard
                  pullRequests={pullRequests()}
                  tasks={tasks()}
                  projectNames={projectNames()}
                  onOpen={openInCurrentSplit}
                />

                <div ref={listRef} class="pb-4">
                  <ListLayoutProvider ref={() => listRef}>
                    <For each={groups()}>
                      {(group) => (
                        <section>
                          <AuthorGroupHeader
                            group={group}
                            summary={
                              group.key === UNKNOWN_AUTHOR_KEY
                                ? undefined
                                : engineerSummaries.data?.get(group.key)
                            }
                          />
                          <For each={group.pullRequests}>
                            {(pullRequest) => (
                              <PullRequestRowWithTasks
                                linked={taskLinks.tasksFor(pullRequest)}
                                pillLimit={TASK_PILL_LIMIT}
                                onOpenTask={openTaskInNewSplit}
                              >
                                <ListEntity
                                  entity={pullRequest}
                                  hideCheckbox
                                  onClick={(event) =>
                                    openInCurrentSplit(pullRequest, event)
                                  }
                                />
                              </PullRequestRowWithTasks>
                            )}
                          </For>
                        </section>
                      )}
                    </For>
                  </ListLayoutProvider>
                </div>
              </div>
            </Match>
          </Switch>
        </div>

        <Show
          when={!githubDisconnected()}
          fallback={<ConnectGithubRailSections />}
        >
          <InsightsRail pullRequests={pullRequests()} tasks={tasks()} />
        </Show>
      </SidePanel.Layout>
    </div>
  );
}
