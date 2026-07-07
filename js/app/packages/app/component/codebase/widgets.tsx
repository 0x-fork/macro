import type { GithubPullRequestEntity, TaskEntity } from '@entity';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import { createMemo, type JSX, Show } from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import {
  BeeswarmChart,
  DivergingBarChart,
  DivergingLegend,
  HorizontalBarList,
  LegendSwatch,
  StackedStatusBar,
  StatTile,
  ThroughputChart,
  ThroughputLegend,
  TrendLineChart,
} from './charts';
import {
  computeContributorLeaderboard,
  computeCycleTimeByAuthor,
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

export const TASK_STATUS_SEGMENTS = [
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
  /**
   * Boxed panel (default) vs plain editorial section — the insights tab lays
   * plain cards out with hairline dividers and generous spacing instead.
   */
  inset?: boolean;
}) {
  const inset = () => props.inset ?? true;
  return (
    <section
      class={
        inset()
          ? 'flex flex-col gap-3 rounded-xl bg-surface/50 p-4 ring ring-edge-muted ring-inset'
          : 'flex flex-col gap-5'
      }
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-col gap-0.5">
          <h3 class="text-[13px] font-semibold text-ink">{props.title}</h3>
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
  inset?: boolean;
}) {
  const weeklyActivity = createMemo(() =>
    computeWeeklyPrActivity(props.pullRequests)
  );

  return (
    <Card
      title="Throughput"
      subtitle="Cumulative PRs opened vs merged, with weekly merged volume — trailing 8 weeks"
      actions={<ThroughputLegend />}
      inset={props.inset}
    >
      <ThroughputChart data={weeklyActivity()} />
    </Card>
  );
}

export function TaskStatusCard(props: {
  tasks: TaskEntity[];
  inset?: boolean;
}) {
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
      inset={props.inset}
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
  inset?: boolean;
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
      inset={props.inset}
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
export function ChurnCard(props: {
  pullRequests: GithubPullRequestEntity[];
  inset?: boolean;
}) {
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
      inset={props.inset}
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
  inset?: boolean;
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
      inset={props.inset}
    >
      <StackedStatusBar segments={segments()} />
    </Card>
  );
}

/** Frontend / backend / infra split, auto-detected from repo + title. */
export function AreaBreakdownCard(props: {
  pullRequests: GithubPullRequestEntity[];
  inset?: boolean;
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
    <Card
      title="Work areas"
      subtitle="Auto-detected from repo and PR titles"
      inset={props.inset}
    >
      <StackedStatusBar segments={segments()} />
    </Card>
  );
}

const PROJECT_ROW_LIMIT = 8;

/** Per-project (repo) PR breakdown: open vs merged vs closed. */
export function ProjectBreakdownCard(props: {
  pullRequests: GithubPullRequestEntity[];
  inset?: boolean;
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
      inset={props.inset}
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
  inset?: boolean;
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
    <Card
      title="Contributors"
      subtitle="PRs merged in the last 30 days"
      inset={props.inset}
    >
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

/** Distinct-but-related hues for beeswarm groups; identity also carries via
 * the column label under each swarm. */
const BEESWARM_COLORS = [
  'var(--color-accent)',
  'var(--color-accent-60)',
  'var(--color-accent-150)',
  'var(--color-accent-240)',
  'var(--color-accent-300)',
];

/** Cycle time per author: one dot per merged PR, median tick per column. */
export function CycleTimeCard(props: {
  pullRequests: GithubPullRequestEntity[];
  inset?: boolean;
}) {
  const groups = createMemo(() =>
    computeCycleTimeByAuthor(props.pullRequests).map((group, index) => ({
      key: group.key,
      label: group.authorLogin ?? 'Unknown',
      color: BEESWARM_COLORS[index % BEESWARM_COLORS.length],
      samples: group.samples,
      median: group.medianDays,
    }))
  );

  return (
    <Card
      title="Cycle time by author"
      subtitle="Days from first activity to merge, one dot per PR — trailing 8 weeks"
      inset={props.inset}
    >
      <Show
        when={groups().length > 0}
        fallback={
          <div class="text-sm text-ink-muted">
            Nothing merged in the last 8 weeks.
          </div>
        }
      >
        <BeeswarmChart
          groups={groups()}
          unit="d"
          ariaLabel="Days to merge per pull request, grouped by author"
        />
      </Show>
    </Card>
  );
}
