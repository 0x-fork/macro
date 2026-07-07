import type { GithubPullRequestEntity } from '@entity';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import { createMemo, Show } from 'solid-js';
import { AuthorAvatar } from './author-avatar';
import {
  ColumnHistogram,
  DonutChart,
  DonutLegend,
  HorizontalBarList,
} from './charts';
import {
  computeContributorLeaderboard,
  countPrSizeBuckets,
  countPullRequestAreas,
  PR_AREAS,
  PR_SIZE_BUCKETS,
  type PrArea,
  type PrSizeBucketKey,
} from './model';

/**
 * Composed insight widgets for the Overview dashboard's side-panel rail.
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

export function formatDays(days: number | undefined): string {
  if (days === undefined) return '—';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))}h`;
  return `${days >= 10 ? Math.round(days) : Math.round(days * 10) / 10}d`;
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

/** Big vs small PRs: histogram across changed-lines size buckets. */
export function PrSizeChart(props: {
  pullRequests: GithubPullRequestEntity[];
}) {
  const bins = createMemo(() => {
    const counts = countPrSizeBuckets(props.pullRequests);
    return PR_SIZE_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      description: bucket.description,
      color: SIZE_BUCKET_COLORS[bucket.key],
      count: counts.get(bucket.key) ?? 0,
    }));
  });

  return (
    <ColumnHistogram
      bins={bins()}
      ariaLabel="Pull requests by changed-lines size bucket"
    />
  );
}

/** Frontend / backend / infra split, auto-detected from repo + title. */
export function WorkAreasChart(props: {
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
    <div class="flex flex-col items-center gap-3 py-1">
      <DonutChart
        segments={segments()}
        centerValue={props.pullRequests.length}
        centerCaption="pull requests"
        ariaLabel="Pull requests by work area"
      />
      <DonutLegend segments={segments()} />
    </div>
  );
}

const CONTRIBUTOR_ROW_LIMIT = 6;

/** Merged-PR leaderboard for the trailing 30 days. */
export function ContributorsList(props: {
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
          {
            label: 'Merged PRs',
            value: row.merged,
            color: 'var(--color-accent)',
          },
        ],
      }))
  );

  return (
    <Show
      when={rows().length > 0}
      fallback={
        <div class="py-1 text-xs text-ink-muted">
          Nothing merged in the last 30 days.
        </div>
      }
    >
      <HorizontalBarList rows={rows()} formatValue={(value) => `${value}`} />
    </Show>
  );
}
