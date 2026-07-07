import type { GithubPullRequestEntity, TaskEntity } from '@entity';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import { createMemo, type JSX, Show } from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import {
  DivergingBarChart,
  DivergingLegend,
  HorizontalBarList,
  LegendSwatch,
  StackedStatusBar,
  StatTile,
  TrendLineChart,
  WeeklyActivityChart,
  WeeklyActivityLegend,
} from './charts';
import {
  computeContributorLeaderboard,
  computePrStats,
  computeRepoBreakdown,
  computeWeeklyChurn,
  computeWeeklyPrActivity,
  computeWeeklyVelocity,
  countPrSizeBuckets,
  countPullRequestAreas,
  countStalePullRequests,
  countTasksByStatus,
  medianTimeToMergeDays,
  PR_AREAS,
  PR_SIZE_BUCKETS,
  type PrArea,
  type PrSizeBucketKey,
} from './model';

/**
 * Composed insight widgets shared between the Overview dashboard and the
 * Insights tab.
 */

const TASK_STATUS_SEGMENTS = [
  {
    key: PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
    label: 'Not started',
    color: 'var(--color-ink-placeholder)',
  },
  {
    key: PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
    label: 'In progress',
    color: 'var(--color-accent)',
  },
  {
    key: PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
    label: 'In review',
    color: 'var(--color-alert-ink)',
  },
  {
    key: PROPERTY_OPTION_IDS.STATUS.COMPLETED,
    label: 'Completed',
    color: 'var(--color-success)',
  },
  {
    key: PROPERTY_OPTION_IDS.STATUS.CANCELED,
    label: 'Canceled',
    color: 'var(--color-failure)',
  },
];

export function Card(props: {
  title: string;
  subtitle?: string;
  actions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <section class="flex flex-col gap-3 rounded-xl bg-surface/50 p-4 ring ring-edge-muted ring-inset">
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col">
          <h3 class="text-sm font-semibold text-ink">{props.title}</h3>
          {props.subtitle && (
            <span class="text-xs text-ink-extra-muted">{props.subtitle}</span>
          )}
        </div>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

export function PrStatTiles(props: {
  pullRequests: GithubPullRequestEntity[];
  /** Extra tiles appended to the same grid (see VelocityStatTiles). */
  extra?: JSX.Element;
}) {
  const stats = createMemo(() => computePrStats(props.pullRequests));

  return (
    <div class="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
      <StatTile label="Open pull requests" value={stats().open} />
      <StatTile label="Drafts" value={stats().draft} />
      <StatTile
        label="Merged"
        value={stats().mergedLast30Days}
        detail="last 30 days"
      />
      <StatTile
        label="Failing checks"
        value={stats().failingChecks}
        detail="on open pull requests"
      />
      {props.extra}
    </div>
  );
}

export function ActivityCard(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const weeklyActivity = createMemo(() =>
    computeWeeklyPrActivity(props.pullRequests)
  );

  return (
    <Card
      title="Pull request activity"
      subtitle="Opened vs merged per week, trailing 8 weeks"
      actions={<WeeklyActivityLegend />}
    >
      <WeeklyActivityChart data={weeklyActivity()} />
    </Card>
  );
}

export function TaskStatusCard(props: { tasks: TaskEntity[] }) {
  const openTaskCount = createMemo(
    () => props.tasks.filter((task) => !task.subType.is_completed).length
  );

  const segments = createMemo(() => {
    const counts = countTasksByStatus(props.tasks);
    return TASK_STATUS_SEGMENTS.map((segment) => ({
      ...segment,
      count: counts.get(segment.key) ?? 0,
    }));
  });

  return (
    <Card
      title="Task statuses"
      subtitle={`${openTaskCount()} open of ${props.tasks.length} recent tasks`}
    >
      <StackedStatusBar segments={segments()} />
    </Card>
  );
}

const AREA_COLORS: Record<PrArea, string> = {
  frontend: 'var(--color-accent)',
  backend: 'var(--color-accent-120)',
  infra: 'var(--color-accent-240)',
  docs: 'var(--color-accent-300)',
  other: 'var(--color-ink-placeholder)',
};

const AREA_LABELS: Record<PrArea, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  infra: 'Infra & CI',
  docs: 'Docs',
  other: 'Other',
};

/** One-hue lightness ramp (light → dark with size) for the size buckets. */
const SIZE_BUCKET_COLORS: Record<PrSizeBucketKey, string> = {
  xs: 'color-mix(in oklab, var(--color-accent) 25%, transparent)',
  s: 'color-mix(in oklab, var(--color-accent) 45%, transparent)',
  m: 'color-mix(in oklab, var(--color-accent) 65%, transparent)',
  l: 'color-mix(in oklab, var(--color-accent) 85%, transparent)',
  xl: 'var(--color-accent)',
};

const OPEN_COLOR = 'var(--color-accent)';
const MERGED_COLOR = 'var(--color-success)';
const CLOSED_COLOR = 'var(--color-ink-placeholder)';

function formatDays(days: number | undefined): string {
  if (days === undefined) return '—';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${days >= 10 ? Math.round(days) : Math.round(days * 10) / 10}d`;
}

/** Extra CTO-facing tiles for the insights tab. */
export function VelocityStatTiles(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const medianMerge = createMemo(() =>
    medianTimeToMergeDays(props.pullRequests)
  );
  const stale = createMemo(() => countStalePullRequests(props.pullRequests));

  return (
    <>
      <StatTile
        label="Median time to merge"
        value={formatDays(medianMerge())}
        detail="last 30 days"
      />
      <StatTile
        label="Stale pull requests"
        value={stale()}
        detail="open, quiet for 7+ days"
      />
    </>
  );
}

/** PR velocity: median time-to-merge per week. */
export function VelocityCard(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const data = createMemo(() =>
    computeWeeklyVelocity(props.pullRequests).map((week) => ({
      label: week.label,
      value: week.medianDays,
      detail:
        week.mergedCount > 0 ? `${week.mergedCount} merged` : 'nothing merged',
    }))
  );

  return (
    <Card
      title="PR velocity"
      subtitle="Median days from first activity to merge, per week"
    >
      <TrendLineChart
        data={data()}
        unit="d"
        ariaLabel="Median days to merge per week"
      />
    </Card>
  );
}

/** Weekly code churn: lines added above the baseline, deleted below. */
export function ChurnCard(props: { pullRequests: GithubPullRequestEntity[] }) {
  const data = createMemo(() =>
    computeWeeklyChurn(props.pullRequests).map((week) => ({
      label: week.label,
      positive: week.additions,
      negative: week.deletions,
    }))
  );

  return (
    <Card
      title="Code churn"
      subtitle="Lines changed by merged PRs, per week"
      actions={
        <DivergingLegend positiveLabel="Added" negativeLabel="Deleted" />
      }
    >
      <DivergingBarChart
        data={data()}
        positiveLabel="Added"
        negativeLabel="Deleted"
        ariaLabel="Lines added and deleted per week"
      />
    </Card>
  );
}

/** Big vs small PRs: distribution across size buckets. */
export function SizeDistributionCard(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const segments = createMemo(() => {
    const counts = countPrSizeBuckets(props.pullRequests);
    return PR_SIZE_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: `${bucket.label} (${bucket.description})`,
      color: SIZE_BUCKET_COLORS[bucket.key],
      count: counts.get(bucket.key) ?? 0,
    }));
  });

  return (
    <Card
      title="PR size"
      subtitle="Changed lines per PR — small PRs merge faster"
    >
      <StackedStatusBar segments={segments()} />
    </Card>
  );
}

/** Frontend / backend / infra split, auto-detected from repo + title. */
export function AreaBreakdownCard(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const segments = createMemo(() => {
    const counts = countPullRequestAreas(props.pullRequests);
    return PR_AREAS.map((area) => ({
      key: area,
      label: AREA_LABELS[area],
      color: AREA_COLORS[area],
      count: counts.get(area) ?? 0,
    }));
  });

  return (
    <Card title="Work areas" subtitle="Auto-detected from repo and PR titles">
      <StackedStatusBar segments={segments()} />
    </Card>
  );
}

const PROJECT_ROW_LIMIT = 8;

/** Per-project (repo) PR breakdown: open vs merged vs closed. */
export function ProjectBreakdownCard(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const breakdown = createMemo(() => computeRepoBreakdown(props.pullRequests));

  const rows = createMemo(() =>
    breakdown()
      .slice(0, PROJECT_ROW_LIMIT)
      .map((row) => ({
        key: row.repo,
        label: (
          <span title={row.repo}>{row.repo.split('/')[1] ?? row.repo}</span>
        ),
        segments: [
          { label: 'Open', value: row.open, color: OPEN_COLOR },
          { label: 'Merged', value: row.merged, color: MERGED_COLOR },
          { label: 'Closed', value: row.closed, color: CLOSED_COLOR },
        ],
      }))
  );

  const hidden = () => Math.max(0, breakdown().length - PROJECT_ROW_LIMIT);

  return (
    <Card
      title="Projects"
      subtitle="PRs per repository, auto-detected"
      actions={
        <div class="flex items-center gap-3">
          <LegendSwatch color={OPEN_COLOR} label="Open" />
          <LegendSwatch color={MERGED_COLOR} label="Merged" />
          <LegendSwatch color={CLOSED_COLOR} label="Closed" />
        </div>
      }
    >
      <Show
        when={rows().length > 0}
        fallback={<div class="text-sm text-ink-muted">No pull requests.</div>}
      >
        <HorizontalBarList rows={rows()} />
        <Show when={hidden() > 0}>
          <div class="text-xs text-ink-extra-muted tabular-nums">
            +{hidden()} more repositories
          </div>
        </Show>
      </Show>
    </Card>
  );
}

const CONTRIBUTOR_ROW_LIMIT = 8;

/** Merged-PR leaderboard for the trailing 30 days. */
export function ContributorsCard(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const leaderboard = createMemo(() =>
    computeContributorLeaderboard(props.pullRequests)
  );

  const rows = createMemo(() =>
    leaderboard()
      .slice(0, CONTRIBUTOR_ROW_LIMIT)
      .map((row) => ({
        key: row.key,
        label: (
          <span class="flex items-center gap-1.5 min-w-0">
            <AuthorAvatar login={row.authorLogin} class="size-4 shrink-0" />
            <span class="truncate">{row.authorLogin ?? 'Unknown'}</span>
          </span>
        ),
        segments: [
          { label: 'Merged PRs', value: row.merged, color: OPEN_COLOR },
        ],
      }))
  );

  return (
    <Card title="Contributors" subtitle="PRs merged in the last 30 days">
      <Show
        when={rows().length > 0}
        fallback={
          <div class="text-sm text-ink-muted">
            Nothing merged in the last 30 days.
          </div>
        }
      >
        <HorizontalBarList rows={rows()} formatValue={(value) => `${value}`} />
      </Show>
    </Card>
  );
}
