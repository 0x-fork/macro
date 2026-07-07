import { useGlobalNotificationSource } from '@app/component/GlobalAppState';
import { GroupDropdown } from '@app/component/next-soup/soup-view/filters-bar/group-dropdown';
import { SortDropdown } from '@app/component/next-soup/soup-view/filters-bar/sort-dropdown';
import {
  GITHUB_PR_GROUP_OPTIONS,
  type GroupOptionId,
} from '@app/component/next-soup/soup-view/group-options';
import {
  GITHUB_PR_SORT_OPTIONS,
  SORT_CONFIGS,
  type SystemSortOption,
} from '@app/component/next-soup/soup-view/sort-options';
import { openEntityInSplitFromUnifiedList } from '@app/component/next-soup/utils';
import { SidePanel } from '@app/component/side-panel';
import { SplitHeaderLeft } from '@app/component/split-layout/components/SplitHeader';
import { useSplitPanelOrThrow } from '@app/component/split-layout/layoutUtils';
import { globalSplitManager } from '@app/signal/splitLayout';
import { TabsInset } from '@core/component/TabsInset';
import {
  type EntityData,
  formatRelativeTimestamp,
  type GithubPullRequestEntity,
  ListEntity,
  ListLayoutProvider,
  type TaskEntity,
} from '@entity';
import { openNotification, useEntityTypeNotifications } from '@notifications';
import CaretDownIcon from '@phosphor/caret-down.svg';
import CaretRightIcon from '@phosphor/caret-right.svg';
import CheckIcon from '@phosphor/check.svg';
import GitBranchIcon from '@phosphor/git-branch.svg';
import GitMergeIcon from '@phosphor/git-merge.svg';
import GitPullRequestIcon from '@phosphor/git-pull-request.svg';
import SparkleIcon from '@phosphor/sparkle.svg';
import UsersIcon from '@phosphor/users.svg';
import UsersThreeIcon from '@phosphor/users-three.svg';
import { useGithubLinkStatusQuery } from '@queries/auth/github-link';
import { useContacts } from '@queries/contacts/contacts';
import { useCurrentTeamQuery } from '@queries/team/teams';
import { Button, cn, Dropdown, EmptyStatePanel } from '@ui';
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
import { useCodebasePullRequests, useCodebaseTasks } from './data';
import {
  attentionReasonPhrase,
  averageOpenAgeDays,
  buildEngineerBentos,
  computeReviewAttention,
  computeWeeklyPrActivity,
  countStalePullRequests,
  countTasksByStatus,
  groupPullRequests,
  matchesPrStatusFilter,
  medianTimeToMergeDays,
  PR_STATUS_FILTERS,
  PR_STATUS_LABELS,
  type PrGroupId,
  type PrStatusFilter,
  type PullRequestGroup,
  pullRequestAuthorKey,
  pullRequestDisplayStatus,
  type ReviewAttentionItem,
  UNKNOWN_AUTHOR_KEY,
} from './model';
import {
  useEngineerSummariesQuery,
  useTeamDailySummaryQuery,
} from './summaries';
import { createTaskLinkIndex, PullRequestRowWithTasks } from './task-links';
import {
  ContributorsList,
  formatDays,
  PrSizeChart,
  TASK_STATUS_SEGMENTS,
  WorkAreasChart,
} from './widgets';

/** Linked-task pills shown per PR row. */
const TASK_PILL_LIMIT = 2;
/** Reason chips shown per attention row before collapsing into "+N". */
const REASON_LIMIT = 2;

const STATUS_TAB_ITEMS = PR_STATUS_FILTERS.map((value) => ({
  value,
  label: PR_STATUS_LABELS[value],
}));

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

/** Small chip appended to a row (e.g. "jbecke requested your review"). */
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
 * One PR that needs me, with why: chips built from the underlying inbox
 * notifications ("requested your review" / "mentioned you"). The check
 * button marks those notifications done, which clears the row here and in
 * the inbox alike.
 */
function AttentionRow(props: {
  item: ReviewAttentionItem;
  onOpen: (item: ReviewAttentionItem, event: MouseEvent) => void;
  onDone: (item: ReviewAttentionItem) => void;
}) {
  const reasons = () => props.item.reasons.slice(0, REASON_LIMIT);
  const overflow = () => props.item.reasons.length - REASON_LIMIT;

  return (
    <div
      class="group/attention flex w-full cursor-pointer items-center gap-2 rounded-lg bg-ink/3 px-2.5 py-2 hover:bg-ink/6"
      onClick={(event) => props.onOpen(props.item, event)}
    >
      <Show
        when={props.item.pullRequest}
        fallback={
          <GitPullRequestIcon class="size-3.5 shrink-0 text-ink-muted" />
        }
      >
        {(pullRequest) => <PrStatusIcon pullRequest={pullRequest()} />}
      </Show>
      <span class="min-w-0 flex-1 truncate text-xs font-medium text-ink">
        {props.item.title}
        <span class="pl-2 font-normal text-[11px] text-ink-extra-muted">
          {props.item.reference}
        </span>
      </span>
      <For each={reasons()}>
        {(reason) => (
          <MetaChip class="bg-accent/10 text-accent">
            <Show when={reason.actorLogin}>
              <AuthorAvatar login={reason.actorLogin} class="size-3 shrink-0" />
              <span class="max-w-24 truncate">{reason.actorLogin}</span>
            </Show>
            {attentionReasonPhrase(reason.tag)}
            <span class="font-normal text-accent/70">
              {formatRelativeTimestamp(new Date(reason.createdAt), {
                condensed: true,
              })}
            </span>
          </MetaChip>
        )}
      </For>
      <Show when={overflow() > 0}>
        <span class="shrink-0 text-[10px] text-ink-extra-muted tabular-nums">
          +{overflow()}
        </span>
      </Show>
      <button
        type="button"
        title="Mark done"
        class="shrink-0 rounded-md p-1 text-ink-extra-muted opacity-0 outline-none transition-opacity hover:bg-ink/8 hover:text-ink group-hover/attention:opacity-100 focus-visible:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          props.onDone(props.item);
        }}
      >
        <CheckIcon class="size-3.5" />
      </button>
    </div>
  );
}

/**
 * A collapsible notification-driven section ("Review requested from me" /
 * "Comments mentioning me"), fed by the same notifications as the inbox.
 */
function AttentionSectionCard(props: {
  title: string;
  items: ReviewAttentionItem[];
  onOpen: (item: ReviewAttentionItem, event: MouseEvent) => void;
  onDone: (item: ReviewAttentionItem) => void;
}) {
  const [open, setOpen] = createSignal(true);

  return (
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
          {props.title}
        </span>
        <span class="text-[11px] text-ink-extra-muted tabular-nums">
          {props.items.length === 0
            ? 'all caught up'
            : `${props.items.length} pull request${props.items.length === 1 ? '' : 's'}`}
        </span>
      </button>
      <Show when={open() && props.items.length > 0}>
        <div class="flex flex-col gap-1.5 pt-2.5">
          <For each={props.items}>
            {(item) => (
              <AttentionRow
                item={item}
                onOpen={props.onOpen}
                onDone={props.onDone}
              />
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}

function SectionHeading(props: { title: string; meta?: string }) {
  return (
    <div class="flex items-baseline gap-2 px-3 pb-1">
      <h2 class="text-[13px] font-semibold text-ink">{props.title}</h2>
      <Show when={props.meta}>
        <span class="text-[11px] text-ink-extra-muted tabular-nums">
          {props.meta}
        </span>
      </Show>
    </div>
  );
}

/**
 * Header above each group in the "Everyone" list. Person groups get the
 * avatar and per-engineer AI summary; other groupings a plain label.
 */
function GroupHeader(props: {
  group: PullRequestGroup;
  showAvatar: boolean;
  summary?: string;
}) {
  return (
    <div class="flex flex-col gap-1 px-3 pt-4 pb-1.5">
      <div class="flex items-center gap-2">
        <Show when={props.showAvatar}>
          <AuthorAvatar
            login={props.group.authorLogin}
            class="size-5 shrink-0"
          />
        </Show>
        <span class="text-sm font-semibold text-ink">{props.group.label}</span>
        <span class="text-xs text-ink-extra-muted tabular-nums">
          {props.group.openCount} open · {props.group.pullRequests.length} total
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
        id="codebase-pr-size"
        title="PR size"
        defaultOpen
        order={3}
      >
        <PrSizeChart pullRequests={props.pullRequests} />
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-work-areas"
        title="Work areas"
        defaultOpen
        order={4}
      >
        <WorkAreasChart pullRequests={props.pullRequests} />
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-contributors"
        title="Contributors"
        defaultOpen
        order={5}
      >
        <ContributorsList pullRequests={props.pullRequests} />
      </SidePanel.Section>
      <SidePanel.Section
        id="codebase-task-statuses"
        title="Task statuses"
        defaultOpen
        order={6}
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
 * The Codebase dashboard, top to bottom: my open pull requests, review
 * requests and comment mentions aimed at me (driven by the same
 * notifications as the inbox), the team's daily digest, and everyone's pull
 * requests as a unified soup-backed list. The filter toolbar (status,
 * person, repository, and the soup group/sort dropdowns) renders into the
 * split header via a portal; key insight charts dock in the right side
 * panel. Scoped to the current team's members when the user belongs to one.
 */
export function OverviewSection() {
  const panel = useSplitPanelOrThrow();
  const githubLink = useGithubLinkStatusQuery();
  const { query: prQuery, pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();
  const contacts = useContacts();
  const team = useCurrentTeamQuery();
  const notificationSource = useGlobalNotificationSource();
  const foreignEntityNotifications = useEntityTypeNotifications(
    notificationSource,
    'foreign_entity'
  );

  const githubDisconnected = () =>
    githubLink.isSuccess && githubLink.data?.status !== 'linked';

  const teamMemberIds = createMemo(() => {
    const members = team.data?.members;
    return members?.length
      ? new Set(members.map((member) => member.user_id))
      : undefined;
  });

  const openTasks = createMemo(() =>
    tasks().filter((task) => !task.subType.is_completed)
  );
  const taskLinks = createTaskLinkIndex(openTasks);

  // --- My pull requests --------------------------------------------------
  // authorLogin comes from the PR metadata; the current user's login comes
  // from auth-service's /link/github/status.
  const myLogin = () => githubLink.data?.username;
  const myPullRequests = createMemo(() => {
    const login = myLogin();
    if (!login) return [];
    return pullRequests().filter((pullRequest) => {
      if (pullRequest.metadata.authorLogin !== login) return false;
      const status = pullRequestDisplayStatus(pullRequest);
      return status === 'open' || status === 'draft';
    });
  });

  // --- Notification-driven sections ---------------------------------------
  const reviewRequests = createMemo(() =>
    computeReviewAttention(foreignEntityNotifications(), pullRequests(), [
      'github_review_requested',
    ])
  );
  const mentions = createMemo(() =>
    computeReviewAttention(foreignEntityNotifications(), pullRequests(), [
      'github_pr_mention',
    ])
  );

  // --- The unified list (state drives the header toolbar) ---------------
  const [statusFilter, setStatusFilter] = createSignal<PrStatusFilter>('open');
  const [authorFilter, setAuthorFilter] = createSignal<string[]>([]);
  const [repoFilter, setRepoFilter] = createSignal<string[]>([]);
  // Group/sort reuse the soup-view option sets and comparators.
  const [groupBy, setGroupBy] = createSignal<GroupOptionId>('pr_author');
  const [sortId, setSortId] = createSignal<SystemSortOption>('updated_at');

  const authors = createMemo(() => {
    const logins = new Set<string>();
    for (const pullRequest of pullRequests()) {
      logins.add(pullRequestAuthorKey(pullRequest));
    }
    return [...logins].sort((a, b) => a.localeCompare(b));
  });

  const repos = createMemo(() => {
    const keys = new Set<string>();
    for (const pullRequest of pullRequests()) {
      keys.add(`${pullRequest.metadata.owner}/${pullRequest.metadata.repo}`);
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  });

  const toggleAuthor = (login: string, checked: boolean) => {
    setAuthorFilter((current) =>
      checked ? [...current, login] : current.filter((l) => l !== login)
    );
  };

  const toggleRepo = (repo: string, checked: boolean) => {
    setRepoFilter((current) =>
      checked ? [...current, repo] : current.filter((r) => r !== repo)
    );
  };

  const filtered = createMemo(() => {
    const selectedAuthors = authorFilter();
    const selectedRepos = repoFilter();
    return pullRequests().filter((pullRequest) => {
      if (!matchesPrStatusFilter(pullRequest, statusFilter())) return false;
      if (
        selectedAuthors.length > 0 &&
        !selectedAuthors.includes(pullRequestAuthorKey(pullRequest))
      ) {
        return false;
      }
      if (
        selectedRepos.length > 0 &&
        !selectedRepos.includes(
          `${pullRequest.metadata.owner}/${pullRequest.metadata.repo}`
        )
      ) {
        return false;
      }
      return true;
    });
  });

  const sorted = createMemo(() =>
    [...filtered()].sort(SORT_CONFIGS[sortId()].fn)
  );

  const groups = createMemo(() =>
    groupPullRequests(sorted(), groupBy() as PrGroupId)
  );

  // Per-engineer AI summaries, keyed by author login (bentos exist purely to
  // feed the digest builder and reuse its team scoping).
  const bentos = createMemo(() =>
    buildEngineerBentos(pullRequests(), tasks(), contacts(), {
      teamMemberIds: teamMemberIds(),
    })
  );
  const engineerSummaries = useEngineerSummariesQuery(bentos, pullRequests);

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

  const openAttentionItem = (item: ReviewAttentionItem, event: MouseEvent) => {
    // Prefer the loaded PR row; fall back to the inbox's own notification
    // navigation when the PR is outside the current query window.
    if (item.pullRequest) {
      openInCurrentSplit(item.pullRequest, event);
      return;
    }
    const notificationId = item.reasons[0]?.notificationId;
    const notification = foreignEntityNotifications().find(
      (n) => n.id === notificationId
    );
    const manager = globalSplitManager();
    if (notification && manager) {
      openNotification(notification, manager, event.metaKey || event.ctrlKey);
    }
  };

  const markAttentionDone = (item: ReviewAttentionItem) => {
    const ids = new Set(item.notificationIds);
    void notificationSource.bulkMarkAsDone(
      foreignEntityNotifications().filter((n) => ids.has(n.id))
    );
  };

  let listRef: HTMLDivElement | undefined;

  return (
    <div class="min-h-0 flex-1">
      <SplitHeaderLeft>
        <div class="h-full flex min-w-0 items-center gap-3">
          <span class="shrink-0 text-sm font-semibold">Codebase</span>
          <Show when={!githubDisconnected()}>
            <div class="flex min-w-0 items-center gap-2">
              <TabsInset
                list={STATUS_TAB_ITEMS}
                value={statusFilter()}
                onChange={(value) => setStatusFilter(value as PrStatusFilter)}
              />
              <Dropdown placement="bottom-start" gutter={4}>
                <Dropdown.Trigger
                  variant="ghost"
                  size="sm"
                  class="gap-1.5 text-ink-muted ring ring-edge-muted ring-inset rounded-lg"
                >
                  <UsersIcon class="size-3.5" />
                  {authorFilter().length > 0
                    ? `${authorFilter().length} selected`
                    : 'Anyone'}
                  <CaretDownIcon class="size-3 text-ink-extra-muted" />
                </Dropdown.Trigger>
                <Dropdown.Content class="min-w-56 max-h-80 overflow-y-auto shadow-menu">
                  <Dropdown.Group class="p-1">
                    <For each={authors()}>
                      {(login) => (
                        <Dropdown.CheckboxItem
                          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-highlighted:bg-ink/5"
                          checked={authorFilter().includes(login)}
                          onChange={(checked: boolean) =>
                            toggleAuthor(login, checked)
                          }
                          closeOnSelect={false}
                        >
                          <AuthorAvatar
                            login={
                              login === UNKNOWN_AUTHOR_KEY ? undefined : login
                            }
                            class="size-4 shrink-0"
                          />
                          <span class="flex-1 truncate">
                            {login === UNKNOWN_AUTHOR_KEY
                              ? 'Unknown author'
                              : login}
                          </span>
                          <Show when={authorFilter().includes(login)}>
                            <span class="text-xs text-accent">✓</span>
                          </Show>
                        </Dropdown.CheckboxItem>
                      )}
                    </For>
                    <Show when={authorFilter().length > 0}>
                      <Dropdown.Item
                        class="mt-1 rounded-md px-2 py-1.5 text-sm text-ink-muted outline-none data-highlighted:bg-ink/5"
                        onSelect={() => setAuthorFilter([])}
                      >
                        Clear author filter
                      </Dropdown.Item>
                    </Show>
                  </Dropdown.Group>
                </Dropdown.Content>
              </Dropdown>
              <Dropdown placement="bottom-start" gutter={4}>
                <Dropdown.Trigger
                  variant="ghost"
                  size="sm"
                  class="gap-1.5 text-ink-muted ring ring-edge-muted ring-inset rounded-lg"
                >
                  <GitBranchIcon class="size-3.5" />
                  {repoFilter().length > 0
                    ? `${repoFilter().length} selected`
                    : 'All repos'}
                  <CaretDownIcon class="size-3 text-ink-extra-muted" />
                </Dropdown.Trigger>
                <Dropdown.Content class="min-w-56 max-h-80 overflow-y-auto shadow-menu">
                  <Dropdown.Group class="p-1">
                    <For each={repos()}>
                      {(repo) => (
                        <Dropdown.CheckboxItem
                          class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink outline-none data-highlighted:bg-ink/5"
                          checked={repoFilter().includes(repo)}
                          onChange={(checked: boolean) =>
                            toggleRepo(repo, checked)
                          }
                          closeOnSelect={false}
                        >
                          <GitBranchIcon class="size-3.5 shrink-0 text-ink-muted" />
                          <span class="flex-1 truncate" title={repo}>
                            {repo.split('/')[1] ?? repo}
                          </span>
                          <Show when={repoFilter().includes(repo)}>
                            <span class="text-xs text-accent">✓</span>
                          </Show>
                        </Dropdown.CheckboxItem>
                      )}
                    </For>
                    <Show when={repoFilter().length > 0}>
                      <Dropdown.Item
                        class="mt-1 rounded-md px-2 py-1.5 text-sm text-ink-muted outline-none data-highlighted:bg-ink/5"
                        onSelect={() => setRepoFilter([])}
                      >
                        Clear repository filter
                      </Dropdown.Item>
                    </Show>
                  </Dropdown.Group>
                </Dropdown.Content>
              </Dropdown>
              <GroupDropdown
                value={groupBy}
                onChange={setGroupBy}
                options={GITHUB_PR_GROUP_OPTIONS}
              />
              <SortDropdown
                value={sortId}
                onChange={setSortId}
                options={GITHUB_PR_SORT_OPTIONS}
              />
            </div>
          </Show>
        </div>
      </SplitHeaderLeft>
      <SidePanel.Layout>
        <div class="size-full min-h-0 overflow-y-auto @container">
          {/* Null-rendering collectors feed the PR→task pill mapping. */}
          <taskLinks.Collectors />

          <Switch>
            <Match when={githubDisconnected()}>
              <ConnectGithubOverview />
            </Match>
            <Match when={prQuery.isLoading && pullRequests().length === 0}>
              <div class="px-6 py-6 text-sm text-ink-muted">Loading team…</div>
            </Match>
            <Match
              when={
                pullRequests().length === 0 &&
                reviewRequests().length === 0 &&
                mentions().length === 0
              }
            >
              <EmptyStatePanel
                centered
                graphic={UsersThreeIcon}
                graphicClass="h-24 w-24 text-ink-extra-muted"
                title="No pull requests"
                description="Pull requests from your connected GitHub account will show up here as they see activity."
              />
            </Match>
            <Match when={true}>
              <div
                ref={listRef}
                class="flex w-full flex-col gap-4 px-4 py-4 pb-8"
              >
                <ListLayoutProvider ref={() => listRef}>
                  <Show when={myLogin()}>
                    <section>
                      <SectionHeading
                        title="My pull requests"
                        meta={
                          myPullRequests().length > 0
                            ? `${myPullRequests().length} open`
                            : undefined
                        }
                      />
                      <Show
                        when={myPullRequests().length > 0}
                        fallback={
                          <p class="px-3 py-1 text-xs text-ink-extra-muted">
                            Nothing open right now.
                          </p>
                        }
                      >
                        <For each={myPullRequests()}>
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
                      </Show>
                    </section>
                  </Show>

                  <AttentionSectionCard
                    title="Review requested from me"
                    items={reviewRequests()}
                    onOpen={openAttentionItem}
                    onDone={markAttentionDone}
                  />

                  <AttentionSectionCard
                    title="Comments mentioning me"
                    items={mentions()}
                    onOpen={openAttentionItem}
                    onDone={markAttentionDone}
                  />

                  <TeamDailySummary
                    pullRequests={pullRequests()}
                    tasks={tasks()}
                  />

                  <section>
                    <SectionHeading
                      title="Everyone"
                      meta={`${filtered().length} pull request${filtered().length === 1 ? '' : 's'}`}
                    />
                    <Show
                      when={groups().length > 0}
                      fallback={
                        <p class="px-3 py-2 text-xs text-ink-extra-muted">
                          No pull requests match the current filters.
                        </p>
                      }
                    >
                      <For each={groups()}>
                        {(group) => (
                          <section>
                            <Show when={group.label !== ''}>
                              <GroupHeader
                                group={group}
                                showAvatar={groupBy() === 'pr_author'}
                                summary={
                                  groupBy() === 'pr_author' &&
                                  group.key !== UNKNOWN_AUTHOR_KEY
                                    ? engineerSummaries.data?.get(group.key)
                                    : undefined
                                }
                              />
                            </Show>
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
                    </Show>
                    <Show when={prQuery.hasNextPage}>
                      <div class="flex justify-center pt-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          class="text-ink-muted ring ring-edge-muted ring-inset rounded-lg"
                          disabled={prQuery.isFetchingNextPage}
                          onClick={() => void prQuery.fetchNextPage()}
                        >
                          {prQuery.isFetchingNextPage
                            ? 'Loading…'
                            : 'Load more'}
                        </Button>
                      </div>
                    </Show>
                  </section>
                </ListLayoutProvider>
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
