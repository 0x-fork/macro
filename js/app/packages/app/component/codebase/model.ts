import type {
  GithubPullRequestEntity,
  TaskEntity,
  TaskEntityWithProperties,
} from '@entity/types/entity';
import {
  getTaskAssigneeIds,
  getTaskStatusOptionId,
} from '@entity/utils/task-properties';
import { PROPERTY_OPTION_IDS } from '@property/constants';

/**
 * Pure view-model helpers for the codebase view: PR status derivation,
 * client-side grouping (by author / by project), and insight aggregations.
 * Kept free of query/service imports so they stay unit-testable.
 */

export const PR_STATUS_FILTERS = [
  'all',
  'open',
  'draft',
  'merged',
  'closed',
] as const;

export type PrStatusFilter = (typeof PR_STATUS_FILTERS)[number];

export type PrDisplayStatus = Exclude<PrStatusFilter, 'all'>;

/**
 * GitHub reports draft PRs with `state: open`; the stored status only carries
 * open/merged/closed. `draft` is enrichment-only, so draft PRs without it fall
 * back to plain `open`.
 */
export function pullRequestDisplayStatus(
  pullRequest: GithubPullRequestEntity
): PrDisplayStatus {
  if (pullRequest.metadata.status === 'open' && pullRequest.metadata.draft) {
    return 'draft';
  }
  return pullRequest.metadata.status;
}

export function matchesPrStatusFilter(
  pullRequest: GithubPullRequestEntity,
  filter: PrStatusFilter
): boolean {
  if (filter === 'all') return true;
  return pullRequestDisplayStatus(pullRequest) === filter;
}

/**
 * The stored GitHub association key for a PR, in `owner/repo/pull/number`
 * format — the one identifier shared verbatim by the soup PR metadata and
 * the document→PR refs endpoint, so task↔PR joins go through it.
 */
export function pullRequestGithubKey(
  pullRequest: GithubPullRequestEntity
): string {
  const meta = pullRequest.metadata;
  return `${meta.owner}/${meta.repo}/pull/${meta.number}`;
}

export const UNKNOWN_AUTHOR_KEY = 'unknown';

export function pullRequestAuthorKey(
  pullRequest: GithubPullRequestEntity
): string {
  return pullRequest.metadata.authorLogin ?? UNKNOWN_AUTHOR_KEY;
}

export type PullRequestAuthorGroup = {
  /** Grouping key: the GitHub login, or {@link UNKNOWN_AUTHOR_KEY}. */
  key: string;
  /** GitHub login when known. */
  authorLogin?: string;
  pullRequests: GithubPullRequestEntity[];
  openCount: number;
};

/**
 * Groups pull requests by author, preserving the incoming (updated-at) order
 * within each group. Groups with open work sort first, then by size.
 */
export function groupPullRequestsByAuthor(
  pullRequests: GithubPullRequestEntity[]
): PullRequestAuthorGroup[] {
  const groups = new Map<string, PullRequestAuthorGroup>();

  for (const pullRequest of pullRequests) {
    const key = pullRequestAuthorKey(pullRequest);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        authorLogin: pullRequest.metadata.authorLogin,
        pullRequests: [],
        openCount: 0,
      };
      groups.set(key, group);
    }
    group.pullRequests.push(pullRequest);
    const status = pullRequestDisplayStatus(pullRequest);
    if (status === 'open' || status === 'draft') {
      group.openCount += 1;
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.openCount !== b.openCount) return b.openCount - a.openCount;
    if (a.pullRequests.length !== b.pullRequests.length) {
      return b.pullRequests.length - a.pullRequests.length;
    }
    return a.key.localeCompare(b.key);
  });
}

export const NO_PROJECT_KEY = 'no-project';

export type TaskProjectGroup = {
  /** Grouping key: the project id, or {@link NO_PROJECT_KEY}. */
  key: string;
  name: string;
  tasks: TaskEntity[];
  openCount: number;
};

/**
 * Groups tasks by their containing project, preserving the incoming order
 * within each group. Named projects sort alphabetically; ungrouped tasks last.
 */
export function groupTasksByProject(
  tasks: TaskEntity[],
  projectNames: Map<string, string>
): TaskProjectGroup[] {
  const groups = new Map<string, TaskProjectGroup>();

  for (const task of tasks) {
    const projectId = task.projectId;
    const key = projectId ?? NO_PROJECT_KEY;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: projectId
          ? (projectNames.get(projectId) ?? 'Unknown project')
          : 'No project',
        tasks: [],
        openCount: 0,
      };
      groups.set(key, group);
    }
    group.tasks.push(task);
    if (!task.subType.is_completed) {
      group.openCount += 1;
    }
  }

  return [...groups.values()].sort((a, b) => {
    if (a.key === NO_PROJECT_KEY) return 1;
    if (b.key === NO_PROJECT_KEY) return -1;
    return a.name.localeCompare(b.name);
  });
}

function isFailedCheckConclusion(conclusion: string | null | undefined) {
  return (
    conclusion === 'failure' ||
    conclusion === 'timed_out' ||
    conclusion === 'cancelled' ||
    conclusion === 'action_required'
  );
}

export function hasFailingChecks(
  pullRequest: GithubPullRequestEntity
): boolean {
  return pullRequest.metadata.checks.some((check) =>
    isFailedCheckConclusion(check.conclusion)
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type PrStats = {
  open: number;
  draft: number;
  mergedLast30Days: number;
  failingChecks: number;
};

/** Headline pull request numbers for the stat tiles. */
export function computePrStats(
  pullRequests: GithubPullRequestEntity[],
  now = new Date()
): PrStats {
  const stats: PrStats = {
    open: 0,
    draft: 0,
    mergedLast30Days: 0,
    failingChecks: 0,
  };
  const mergedCutoff = now.getTime() - 30 * DAY_MS;

  for (const pullRequest of pullRequests) {
    const status = pullRequestDisplayStatus(pullRequest);
    if (status === 'open') stats.open += 1;
    if (status === 'draft') stats.draft += 1;
    if (
      pullRequest.metadata.status === 'merged' &&
      pullRequest.updatedAt != null &&
      new Date(pullRequest.updatedAt).getTime() >= mergedCutoff
    ) {
      stats.mergedLast30Days += 1;
    }
    if (
      (status === 'open' || status === 'draft') &&
      hasFailingChecks(pullRequest)
    ) {
      stats.failingChecks += 1;
    }
  }

  return stats;
}

export type WeeklyPrActivity = {
  weekStart: Date;
  label: string;
  opened: number;
  merged: number;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  // Monday-based weeks.
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  return start;
}

const WEEK_LABEL_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

/**
 * Buckets pull request activity into the trailing `weeks` calendar weeks.
 * Merges are bucketed by `updatedAt` — the merge timestamp isn't stored, but a
 * merged PR's last update is the merge for all practical purposes.
 */
export function computeWeeklyPrActivity(
  pullRequests: GithubPullRequestEntity[],
  weeks = 8,
  now = new Date()
): WeeklyPrActivity[] {
  const currentWeekStart = startOfWeek(now).getTime();

  const buckets: WeeklyPrActivity[] = Array.from(
    { length: weeks },
    (_, index) => {
      const weekStart = new Date(
        currentWeekStart - (weeks - 1 - index) * WEEK_MS
      );
      return {
        weekStart,
        label: WEEK_LABEL_FORMAT.format(weekStart),
        opened: 0,
        merged: 0,
      };
    }
  );

  const bucketFor = (value: string | number | Date | null | undefined) => {
    if (value == null) return undefined;
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return undefined;
    const index =
      buckets.length -
      1 -
      Math.floor(
        (currentWeekStart - startOfWeek(new Date(time)).getTime()) / WEEK_MS
      );
    return buckets[index];
  };

  for (const pullRequest of pullRequests) {
    const openedBucket = bucketFor(pullRequest.createdAt);
    if (openedBucket) openedBucket.opened += 1;

    if (pullRequest.metadata.status === 'merged') {
      const mergedBucket = bucketFor(pullRequest.updatedAt);
      if (mergedBucket) mergedBucket.merged += 1;
    }
  }

  return buckets;
}

/** Millis-parsed timestamp, or undefined when absent/invalid. */
function toTime(
  value: string | number | Date | null | undefined
): number | undefined {
  if (value == null) return undefined;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : time;
}

/**
 * Days from the entity record's creation to its last update. For merged PRs
 * the record is created when the PR is first seen and last updated at merge,
 * so this approximates time-to-merge (merge timestamps aren't stored).
 */
export function pullRequestCycleDays(
  pullRequest: GithubPullRequestEntity
): number | undefined {
  const created = toTime(pullRequest.createdAt);
  const updated = toTime(pullRequest.updatedAt);
  if (created === undefined || updated === undefined) return undefined;
  const days = (updated - created) / DAY_MS;
  return days >= 0 ? days : undefined;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type WeeklyVelocity = {
  weekStart: Date;
  label: string;
  /** Median days from first-seen to merge for PRs merged this week. */
  medianDays: number | undefined;
  mergedCount: number;
};

/**
 * PR velocity: median time-to-merge for PRs merged in each trailing week.
 * Weeks with no merges carry `medianDays: undefined` (a gap, not a zero).
 */
export function computeWeeklyVelocity(
  pullRequests: GithubPullRequestEntity[],
  weeks = 8,
  now = new Date()
): WeeklyVelocity[] {
  const activity = computeWeeklyPrActivity(pullRequests, weeks, now);
  const samples: number[][] = activity.map(() => []);

  for (const pullRequest of pullRequests) {
    if (pullRequest.metadata.status !== 'merged') continue;
    const merged = toTime(pullRequest.updatedAt);
    if (merged === undefined) continue;
    const index = activity.findIndex(
      (week, i) =>
        merged >= week.weekStart.getTime() &&
        (i === activity.length - 1 ||
          merged < activity[i + 1].weekStart.getTime())
    );
    if (index === -1) continue;
    const days = pullRequestCycleDays(pullRequest);
    if (days !== undefined) samples[index].push(days);
  }

  return activity.map((week, index) => ({
    weekStart: week.weekStart,
    label: week.label,
    medianDays: median(samples[index]),
    mergedCount: samples[index].length,
  }));
}

export type WeeklyChurn = {
  weekStart: Date;
  label: string;
  /** Lines added across PRs merged this week. */
  additions: number;
  /** Lines deleted across PRs merged this week. */
  deletions: number;
};

/** Code churn: additions/deletions of PRs merged in each trailing week. */
export function computeWeeklyChurn(
  pullRequests: GithubPullRequestEntity[],
  weeks = 8,
  now = new Date()
): WeeklyChurn[] {
  const activity = computeWeeklyPrActivity(pullRequests, weeks, now);
  const churn: WeeklyChurn[] = activity.map((week) => ({
    weekStart: week.weekStart,
    label: week.label,
    additions: 0,
    deletions: 0,
  }));

  for (const pullRequest of pullRequests) {
    if (pullRequest.metadata.status !== 'merged') continue;
    const merged = toTime(pullRequest.updatedAt);
    if (merged === undefined) continue;
    const index = churn.findIndex(
      (week, i) =>
        merged >= week.weekStart.getTime() &&
        (i === churn.length - 1 || merged < churn[i + 1].weekStart.getTime())
    );
    if (index === -1) continue;
    churn[index].additions += pullRequest.metadata.additions;
    churn[index].deletions += pullRequest.metadata.deletions;
  }

  return churn;
}

export const PR_SIZE_BUCKETS = [
  { key: 'xs', label: 'XS', description: '< 10 lines', max: 10 },
  { key: 's', label: 'S', description: '< 100 lines', max: 100 },
  { key: 'm', label: 'M', description: '< 500 lines', max: 500 },
  { key: 'l', label: 'L', description: '< 1,000 lines', max: 1000 },
  {
    key: 'xl',
    label: 'XL',
    description: '1,000+ lines',
    max: Number.POSITIVE_INFINITY,
  },
] as const;

export type PrSizeBucketKey = (typeof PR_SIZE_BUCKETS)[number]['key'];

/** Bucket a PR by total changed lines (additions + deletions). */
export function pullRequestSizeBucket(
  pullRequest: GithubPullRequestEntity
): PrSizeBucketKey {
  const changed =
    pullRequest.metadata.additions + pullRequest.metadata.deletions;
  for (const bucket of PR_SIZE_BUCKETS) {
    if (changed < bucket.max) return bucket.key;
  }
  return 'xl';
}

export function countPrSizeBuckets(
  pullRequests: GithubPullRequestEntity[]
): Map<PrSizeBucketKey, number> {
  const counts = new Map<PrSizeBucketKey, number>();
  for (const pullRequest of pullRequests) {
    const key = pullRequestSizeBucket(pullRequest);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export const PR_AREAS = [
  'frontend',
  'backend',
  'infra',
  'docs',
  'other',
] as const;

export type PrArea = (typeof PR_AREAS)[number];

const AREA_KEYWORDS: Array<{ area: Exclude<PrArea, 'other'>; words: RegExp }> =
  [
    {
      area: 'infra',
      words:
        /\b(infra|ci|cd|deploy|deployment|docker|k8s|kubernetes|terraform|pulumi|helm|pipeline|workflow|release|build)\b/,
    },
    {
      area: 'docs',
      words: /\b(docs?|readme|documentation|changelog|onboarding)\b/,
    },
    {
      area: 'frontend',
      words:
        /\b(frontend|front-end|ui|ux|css|tailwind|component|design|web|app|react|solid|sidebar|modal|button|layout|style|styles|dark mode|icon|animation)\b/,
    },
    {
      area: 'backend',
      words:
        /\b(backend|back-end|api|server|service|rust|db|database|sql|sqlx|migration|queue|worker|lambda|webhook|auth|storage|endpoint|graphql|cache|redis)\b/,
    },
  ];

/**
 * Best-effort area classification from repo name and PR title keywords. The
 * soup metadata carries no file paths, so this is a heuristic; unmatched PRs
 * land in 'other'.
 */
export function detectPullRequestArea(
  pullRequest: GithubPullRequestEntity
): PrArea {
  const haystack =
    `${pullRequest.metadata.repo} ${pullRequest.metadata.name}`.toLowerCase();
  for (const { area, words } of AREA_KEYWORDS) {
    if (words.test(haystack)) return area;
  }
  return 'other';
}

export function countPullRequestAreas(
  pullRequests: GithubPullRequestEntity[]
): Map<PrArea, number> {
  const counts = new Map<PrArea, number>();
  for (const pullRequest of pullRequests) {
    const area = detectPullRequestArea(pullRequest);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return counts;
}

export type RepoBreakdownRow = {
  /** `owner/repo` — the auto-detected project a PR belongs to. */
  repo: string;
  open: number;
  merged: number;
  closed: number;
  total: number;
};

/** Per-repo PR counts (auto-detected project grouping), largest first. */
export function computeRepoBreakdown(
  pullRequests: GithubPullRequestEntity[]
): RepoBreakdownRow[] {
  const rows = new Map<string, RepoBreakdownRow>();

  for (const pullRequest of pullRequests) {
    const repo = `${pullRequest.metadata.owner}/${pullRequest.metadata.repo}`;
    let row = rows.get(repo);
    if (!row) {
      row = { repo, open: 0, merged: 0, closed: 0, total: 0 };
      rows.set(repo, row);
    }
    const status = pullRequestDisplayStatus(pullRequest);
    if (status === 'open' || status === 'draft') row.open += 1;
    else if (status === 'merged') row.merged += 1;
    else row.closed += 1;
    row.total += 1;
  }

  return [...rows.values()].sort(
    (a, b) => b.total - a.total || a.repo.localeCompare(b.repo)
  );
}

export type ContributorRow = {
  authorLogin: string | undefined;
  key: string;
  merged: number;
  additions: number;
  deletions: number;
};

/** Merged-PR leaderboard over the trailing `days`, largest first. */
export function computeContributorLeaderboard(
  pullRequests: GithubPullRequestEntity[],
  days = 30,
  now = new Date()
): ContributorRow[] {
  const cutoff = now.getTime() - days * DAY_MS;
  const rows = new Map<string, ContributorRow>();

  for (const pullRequest of pullRequests) {
    if (pullRequest.metadata.status !== 'merged') continue;
    const merged = toTime(pullRequest.updatedAt);
    if (merged === undefined || merged < cutoff) continue;

    const key = pullRequestAuthorKey(pullRequest);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        authorLogin: pullRequest.metadata.authorLogin,
        merged: 0,
        additions: 0,
        deletions: 0,
      };
      rows.set(key, row);
    }
    row.merged += 1;
    row.additions += pullRequest.metadata.additions;
    row.deletions += pullRequest.metadata.deletions;
  }

  return [...rows.values()].sort(
    (a, b) => b.merged - a.merged || a.key.localeCompare(b.key)
  );
}

export type CycleTimeGroup = {
  key: string;
  authorLogin: string | undefined;
  /** Days-to-merge samples for PRs merged in the window. */
  samples: number[];
  medianDays: number | undefined;
};

/**
 * Per-author cycle-time samples (days from first activity to merge) for PRs
 * merged in the trailing `days`, largest sample count first. Feeds the
 * beeswarm chart; authors beyond `maxGroups` are dropped, not folded.
 */
export function computeCycleTimeByAuthor(
  pullRequests: GithubPullRequestEntity[],
  { days = 56, maxGroups = 5 }: { days?: number; maxGroups?: number } = {},
  now = new Date()
): CycleTimeGroup[] {
  const cutoff = now.getTime() - days * DAY_MS;
  const groups = new Map<string, CycleTimeGroup>();

  for (const pullRequest of pullRequests) {
    if (pullRequest.metadata.status !== 'merged') continue;
    const merged = toTime(pullRequest.updatedAt);
    if (merged === undefined || merged < cutoff) continue;
    const cycleDays = pullRequestCycleDays(pullRequest);
    if (cycleDays === undefined) continue;

    const key = pullRequestAuthorKey(pullRequest);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        authorLogin: pullRequest.metadata.authorLogin,
        samples: [],
        medianDays: undefined,
      };
      groups.set(key, group);
    }
    group.samples.push(cycleDays);
  }

  return [...groups.values()]
    .sort(
      (a, b) =>
        b.samples.length - a.samples.length || a.key.localeCompare(b.key)
    )
    .slice(0, maxGroups)
    .map((group) => ({ ...group, medianDays: median(group.samples) }));
}

/** Open PRs (incl. drafts) with no activity for at least `days`. */
export function countStalePullRequests(
  pullRequests: GithubPullRequestEntity[],
  days = 7,
  now = new Date()
): number {
  const cutoff = now.getTime() - days * DAY_MS;
  let stale = 0;
  for (const pullRequest of pullRequests) {
    const status = pullRequestDisplayStatus(pullRequest);
    if (status !== 'open' && status !== 'draft') continue;
    const updated = toTime(pullRequest.updatedAt);
    if (updated !== undefined && updated < cutoff) stale += 1;
  }
  return stale;
}

/** Mean age (days since first activity) across open PRs, incl. drafts. */
export function averageOpenAgeDays(
  pullRequests: GithubPullRequestEntity[],
  now = new Date()
): number | undefined {
  const ages: number[] = [];
  for (const pullRequest of pullRequests) {
    const status = pullRequestDisplayStatus(pullRequest);
    if (status !== 'open' && status !== 'draft') continue;
    const created = toTime(pullRequest.createdAt);
    if (created === undefined) continue;
    ages.push(Math.max(0, (now.getTime() - created) / DAY_MS));
  }
  if (ages.length === 0) return undefined;
  return ages.reduce((sum, age) => sum + age, 0) / ages.length;
}

/** Median time-to-merge (days) for PRs merged in the trailing `days`. */
export function medianTimeToMergeDays(
  pullRequests: GithubPullRequestEntity[],
  days = 30,
  now = new Date()
): number | undefined {
  const cutoff = now.getTime() - days * DAY_MS;
  const samples: number[] = [];
  for (const pullRequest of pullRequests) {
    if (pullRequest.metadata.status !== 'merged') continue;
    const merged = toTime(pullRequest.updatedAt);
    if (merged === undefined || merged < cutoff) continue;
    const cycleDays = pullRequestCycleDays(pullRequest);
    if (cycleDays !== undefined) samples.push(cycleDays);
  }
  return median(samples);
}

export const TASK_STATUS_ORDER = [
  PROPERTY_OPTION_IDS.STATUS.NOT_STARTED,
  PROPERTY_OPTION_IDS.STATUS.IN_PROGRESS,
  PROPERTY_OPTION_IDS.STATUS.IN_REVIEW,
  PROPERTY_OPTION_IDS.STATUS.COMPLETED,
  PROPERTY_OPTION_IDS.STATUS.CANCELED,
] as const;

export type TaskStatusOptionId = (typeof TASK_STATUS_ORDER)[number];

export function countTasksByStatus(
  tasks: TaskEntity[]
): Map<TaskStatusOptionId, number> {
  const counts = new Map<TaskStatusOptionId, number>();
  const known = new Set<string>(TASK_STATUS_ORDER);

  for (const task of tasks) {
    let statusId = getTaskStatusOptionId(task as TaskEntityWithProperties);
    if (!statusId || !known.has(statusId)) {
      // Tasks without a recognized status still carry completion state.
      statusId = task.subType.is_completed
        ? PROPERTY_OPTION_IDS.STATUS.COMPLETED
        : PROPERTY_OPTION_IDS.STATUS.NOT_STARTED;
    }
    const key = statusId as TaskStatusOptionId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

/**
 * The soup group-option ids the codebase view supports (see
 * `GITHUB_PR_GROUP_OPTIONS` in the soup-view group options). Sorting reuses
 * soup's `SORT_CONFIGS` comparators directly, so no sort model lives here.
 */
export type PrGroupId = 'pr_author' | 'pr_status' | 'pr_repository' | 'none';

export const PR_STATUS_LABELS: Record<PrStatusFilter, string> = {
  all: 'All',
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
};

const STATUS_GROUP_ORDER: PrDisplayStatus[] = [
  'open',
  'draft',
  'merged',
  'closed',
];

export type PullRequestGroup = {
  key: string;
  label: string;
  /** Set on author groups so headers can render avatars / AI summaries. */
  authorLogin?: string;
  pullRequests: GithubPullRequestEntity[];
  openCount: number;
};

/**
 * Groups pull requests for the unified list. The incoming order (i.e. the
 * active sort) is preserved within each group; only the groups themselves get
 * a grouping-specific order. `none` yields a single unlabeled group.
 */
export function groupPullRequests(
  pullRequests: GithubPullRequestEntity[],
  groupBy: PrGroupId
): PullRequestGroup[] {
  const openCount = (list: GithubPullRequestEntity[]) =>
    list.filter((pullRequest) => {
      const status = pullRequestDisplayStatus(pullRequest);
      return status === 'open' || status === 'draft';
    }).length;

  if (groupBy === 'none') {
    if (pullRequests.length === 0) return [];
    return [
      {
        key: 'all',
        label: '',
        pullRequests,
        openCount: openCount(pullRequests),
      },
    ];
  }

  if (groupBy === 'pr_author') {
    return groupPullRequestsByAuthor(pullRequests).map((group) => ({
      key: group.key,
      label: group.authorLogin ?? 'Unknown author',
      authorLogin: group.authorLogin,
      pullRequests: group.pullRequests,
      openCount: group.openCount,
    }));
  }

  if (groupBy === 'pr_status') {
    const buckets = new Map<PrDisplayStatus, GithubPullRequestEntity[]>();
    for (const pullRequest of pullRequests) {
      const status = pullRequestDisplayStatus(pullRequest);
      const bucket = buckets.get(status);
      if (bucket) bucket.push(pullRequest);
      else buckets.set(status, [pullRequest]);
    }
    return STATUS_GROUP_ORDER.filter((status) => buckets.has(status)).map(
      (status) => {
        const list = buckets.get(status) ?? [];
        return {
          key: status,
          label: PR_STATUS_LABELS[status],
          pullRequests: list,
          openCount: openCount(list),
        };
      }
    );
  }

  const byRepo = new Map<string, GithubPullRequestEntity[]>();
  for (const pullRequest of pullRequests) {
    const key = `${pullRequest.metadata.owner}/${pullRequest.metadata.repo}`;
    const bucket = byRepo.get(key);
    if (bucket) bucket.push(pullRequest);
    else byRepo.set(key, [pullRequest]);
  }
  return [...byRepo.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([key, list]) => ({
      key,
      label: key,
      pullRequests: list,
      openCount: openCount(list),
    }));
}

/** The notification tags that put a PR in "Requires my attention". */
export const ATTENTION_NOTIFICATION_TAGS = [
  'github_review_requested',
  'github_pr_mention',
] as const;

export type AttentionTag = (typeof ATTENTION_NOTIFICATION_TAGS)[number];

/**
 * The slice of a user notification the attention section reads. Structural
 * (rather than `UnifiedNotification`) so this stays unit-testable without the
 * generated notification-service client types.
 */
export type AttentionNotificationLike = {
  id: string;
  done: boolean;
  created_at: string;
  notification_metadata: { tag: string; content?: unknown };
};

/** The common fields every GitHub PR notification's metadata carries. */
type GithubNotificationContent = {
  githubKey?: string;
  title?: string;
  displayName?: string;
  owner?: string;
  repo?: string;
  number?: number;
  url?: string;
  senderGithubLogin?: string | null;
};

export type AttentionReason = {
  notificationId: string;
  tag: AttentionTag;
  /** GitHub login of whoever mentioned me / requested the review. */
  actorLogin?: string;
  createdAt: string;
};

export function attentionReasonPhrase(tag: AttentionTag): string {
  return tag === 'github_review_requested'
    ? 'requested your review'
    : 'mentioned you';
}

export type ReviewAttentionItem = {
  /** `owner/repo/pull/number` — the same key used for task↔PR joins. */
  githubKey: string;
  title: string;
  /** Compact reference, e.g. `macro-inc/macro#4543`. */
  reference: string;
  url?: string;
  /** The loaded soup row, when the PR is inside the current query window. */
  pullRequest?: GithubPullRequestEntity;
  /** Why this PR needs me, most recent first, deduped per (kind, actor). */
  reasons: AttentionReason[];
  /** Every underlying not-done notification id (for mark-as-done). */
  notificationIds: string[];
  latestAt: number;
};

/**
 * Builds attention items from the user's own notifications: PRs where I was
 * mentioned or my review was requested, joined to loaded PR rows via the
 * shared github key. Done notifications are excluded, so clearing them in
 * the inbox clears the section too. Pass a subset of
 * {@link ATTENTION_NOTIFICATION_TAGS} to build a per-kind section (e.g. only
 * review requests).
 */
export function computeReviewAttention(
  notifications: AttentionNotificationLike[],
  pullRequests: GithubPullRequestEntity[],
  includeTags: readonly AttentionTag[] = ATTENTION_NOTIFICATION_TAGS
): ReviewAttentionItem[] {
  const prByKey = new Map<string, GithubPullRequestEntity>();
  for (const pullRequest of pullRequests) {
    prByKey.set(pullRequestGithubKey(pullRequest), pullRequest);
  }

  const tags = new Set<string>(includeTags);
  const items = new Map<string, ReviewAttentionItem>();

  for (const notification of notifications) {
    if (notification.done) continue;
    const tag = notification.notification_metadata.tag;
    if (!tags.has(tag)) continue;
    const content = notification.notification_metadata.content as
      | GithubNotificationContent
      | undefined;
    const githubKey = content?.githubKey;
    if (!githubKey) continue;
    const createdAt = toTime(notification.created_at) ?? 0;

    let item = items.get(githubKey);
    if (!item) {
      const loaded = prByKey.get(githubKey);
      item = {
        githubKey,
        title:
          loaded?.metadata.name ??
          content.title ??
          content.displayName ??
          githubKey,
        reference:
          content.owner && content.repo && content.number !== undefined
            ? `${content.owner}/${content.repo}#${content.number}`
            : githubKey,
        url: content.url,
        pullRequest: loaded,
        reasons: [],
        notificationIds: [],
        latestAt: createdAt,
      };
      items.set(githubKey, item);
    }
    item.notificationIds.push(notification.id);
    if (createdAt > item.latestAt) item.latestAt = createdAt;

    const actorLogin = content.senderGithubLogin ?? undefined;
    const existing = item.reasons.find(
      (reason) => reason.tag === tag && reason.actorLogin === actorLogin
    );
    if (existing) {
      if (createdAt > (toTime(existing.createdAt) ?? 0)) {
        existing.createdAt = notification.created_at;
        existing.notificationId = notification.id;
      }
    } else {
      item.reasons.push({
        notificationId: notification.id,
        tag: tag as AttentionTag,
        actorLogin,
        createdAt: notification.created_at,
      });
    }
  }

  const result = [...items.values()];
  for (const item of result) {
    item.reasons.sort(
      (a, b) => (toTime(b.createdAt) ?? 0) - (toTime(a.createdAt) ?? 0)
    );
  }
  result.sort((a, b) => b.latestAt - a.latestAt);
  return result;
}

export const UNASSIGNED_KEY = 'unassigned';

/**
 * Groups tasks by assignee user id (multi-assignee tasks appear under each
 * assignee); tasks with no assignee land under {@link UNASSIGNED_KEY}.
 */
export function groupTasksByAssignee(
  tasks: TaskEntity[]
): Map<string, TaskEntity[]> {
  const groups = new Map<string, TaskEntity[]>();
  const push = (key: string, task: TaskEntity) => {
    const list = groups.get(key);
    if (list) list.push(task);
    else groups.set(key, [task]);
  };

  for (const task of tasks) {
    const assignees = getTaskAssigneeIds(task as TaskEntityWithProperties);
    if (assignees.length === 0) {
      push(UNASSIGNED_KEY, task);
      continue;
    }
    for (const userId of assignees) {
      push(userId, task);
    }
  }

  return groups;
}

export type EngineerContact = {
  id: string;
  name: string;
  email: string;
};

function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Best-effort GitHub-login ↔ workspace-user match (no mapping is stored).
 * Matches when the normalized login equals the contact's concatenated name or
 * email local-part, or is a ≥5-char prefix of either the name or
 * first-initial+last-name (e.g. "jbecke" → "Jacob Beckerman" → "jbeckerman").
 */
export function matchContactForLogin(
  login: string,
  contacts: EngineerContact[]
): EngineerContact | undefined {
  const normalized = normalizeIdentity(login);
  if (!normalized) return undefined;

  for (const contact of contacts) {
    const nameConcat = normalizeIdentity(contact.name);
    const localPart = normalizeIdentity(contact.email.split('@')[0] ?? '');
    const nameParts = contact.name
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map(normalizeIdentity);
    const initialLast =
      nameParts.length >= 2
        ? `${nameParts[0][0]}${nameParts[nameParts.length - 1]}`
        : '';

    if (normalized === nameConcat || normalized === localPart) return contact;
    if (
      normalized.length >= 5 &&
      ((initialLast && initialLast.startsWith(normalized)) ||
        nameConcat.startsWith(normalized))
    ) {
      return contact;
    }
  }

  return undefined;
}

export type EngineerBento = {
  /** GitHub login when known, else the workspace user id, else 'unassigned'. */
  key: string;
  githubLogin?: string;
  userId?: string;
  displayName: string;
  openPullRequests: GithubPullRequestEntity[];
  openTasks: TaskEntity[];
  mergedLast30Days: number;
};

/**
 * One bento per engineer: their open PRs (by GitHub author) joined with
 * their open tasks (by workspace assignee, via {@link matchContactForLogin}).
 * Assignees without PRs get their own bento; unassigned tasks come last.
 */
export function buildEngineerBentos(
  pullRequests: GithubPullRequestEntity[],
  tasks: TaskEntity[],
  contacts: EngineerContact[],
  options: {
    /**
     * When set, only these workspace users get bentos: the login↔contact
     * match pool narrows to them and assignee-only bentos outside the team
     * are dropped. PR-author bentos always stay (the PRs are team-visible).
     */
    teamMemberIds?: Set<string>;
  } = {},
  now = new Date()
): EngineerBento[] {
  const { teamMemberIds } = options;
  if (teamMemberIds) {
    contacts = contacts.filter((contact) => teamMemberIds.has(contact.id));
  }
  const mergedCutoff = now.getTime() - 30 * DAY_MS;
  const contactsById = new Map(contacts.map((c) => [c.id, c]));

  const openTasksByAssignee = groupTasksByAssignee(
    tasks.filter((task) => !task.subType.is_completed)
  );
  const claimedUserIds = new Set<string>();

  const bentos: EngineerBento[] = [];
  const bentosByAuthor = new Map<string, EngineerBento>();

  for (const pullRequest of pullRequests) {
    const status = pullRequestDisplayStatus(pullRequest);
    const authorKey = pullRequestAuthorKey(pullRequest);

    let bento = bentosByAuthor.get(authorKey);
    if (!bento) {
      const login = pullRequest.metadata.authorLogin;
      const contact = login ? matchContactForLogin(login, contacts) : undefined;
      bento = {
        key: authorKey,
        githubLogin: login,
        userId: contact?.id,
        displayName: contact?.name || login || 'Unknown author',
        openPullRequests: [],
        openTasks: [],
        mergedLast30Days: 0,
      };
      if (contact) claimedUserIds.add(contact.id);
      bentosByAuthor.set(authorKey, bento);
      bentos.push(bento);
    }

    if (status === 'open' || status === 'draft') {
      bento.openPullRequests.push(pullRequest);
    } else if (status === 'merged') {
      const merged = pullRequest.updatedAt
        ? new Date(pullRequest.updatedAt).getTime()
        : Number.NaN;
      if (!Number.isNaN(merged) && merged >= mergedCutoff) {
        bento.mergedLast30Days += 1;
      }
    }
  }

  for (const bento of bentos) {
    if (bento.userId) {
      bento.openTasks = openTasksByAssignee.get(bento.userId) ?? [];
    }
  }

  // Assignees whose tasks weren't claimed by a PR author bento.
  for (const [userId, assignedTasks] of openTasksByAssignee) {
    if (userId === UNASSIGNED_KEY || claimedUserIds.has(userId)) continue;
    if (teamMemberIds && !teamMemberIds.has(userId)) continue;
    const contact = contactsById.get(userId);
    bentos.push({
      key: userId,
      userId,
      displayName: contact?.name || 'Unknown teammate',
      openPullRequests: [],
      openTasks: assignedTasks,
      mergedLast30Days: 0,
    });
  }

  const sorted = bentos
    .filter(
      (bento) =>
        bento.openPullRequests.length > 0 ||
        bento.openTasks.length > 0 ||
        bento.mergedLast30Days > 0
    )
    .sort(
      (a, b) =>
        b.openPullRequests.length +
          b.openTasks.length -
          (a.openPullRequests.length + a.openTasks.length) ||
        b.mergedLast30Days - a.mergedLast30Days ||
        a.displayName.localeCompare(b.displayName)
    );

  const unassigned = openTasksByAssignee.get(UNASSIGNED_KEY);
  if (unassigned?.length) {
    sorted.push({
      key: UNASSIGNED_KEY,
      displayName: 'Unassigned',
      openPullRequests: [],
      openTasks: unassigned,
      mergedLast30Days: 0,
    });
  }

  return sorted;
}

const SUMMARY_LIST_CAP = 20;

function withinWindow(
  value: string | number | Date | null | undefined,
  cutoff: number
): boolean {
  const time = toTime(value);
  return time !== undefined && time >= cutoff;
}

export type TeamActivityDigest = {
  /** Compact plaintext fed to the summarizer (and hashed for caching). */
  digest: string;
  eventCount: number;
};

/**
 * Compact digest of the team's trailing-day activity: merges, newly opened
 * PRs, completed tasks, and tasks that moved into review.
 */
export function buildTeamActivityDigest(
  pullRequests: GithubPullRequestEntity[],
  tasks: TaskEntity[],
  hours = 24,
  now = new Date()
): TeamActivityDigest {
  const cutoff = now.getTime() - hours * 60 * 60 * 1000;
  const lines: string[] = [];
  let eventCount = 0;

  const push = (line: string) => {
    eventCount += 1;
    if (lines.length < SUMMARY_LIST_CAP * 2) lines.push(line);
  };

  for (const pullRequest of pullRequests) {
    const meta = pullRequest.metadata;
    const author = meta.authorLogin ?? 'unknown';
    if (
      meta.status === 'merged' &&
      withinWindow(pullRequest.updatedAt, cutoff)
    ) {
      push(
        `MERGED by ${author}: ${meta.name} (${meta.repo}, +${meta.additions}/−${meta.deletions})`
      );
    } else if (withinWindow(pullRequest.createdAt, cutoff)) {
      push(`OPENED by ${author}: ${meta.name} (${meta.repo})`);
    }
  }

  for (const task of tasks) {
    if (!withinWindow(task.updatedAt, cutoff)) continue;
    const statusId = getTaskStatusOptionId(task as TaskEntityWithProperties);
    if (task.subType.is_completed) {
      push(`TASK COMPLETED: ${task.name}`);
    } else if (statusId === PROPERTY_OPTION_IDS.STATUS.IN_REVIEW) {
      push(`TASK IN REVIEW: ${task.name}`);
    }
  }

  return { digest: lines.join('\n'), eventCount };
}

export type EngineerDigest = {
  key: string;
  displayName: string;
  digest: string;
};

/**
 * Per-engineer digest of recent merges (trailing `days`) plus what's open
 * now, for the bento summaries. Engineers with no material go missing from
 * the result rather than producing empty prompts.
 */
export function buildEngineerDigests(
  bentos: EngineerBento[],
  pullRequests: GithubPullRequestEntity[],
  days = 7,
  now = new Date()
): EngineerDigest[] {
  const cutoff = now.getTime() - days * DAY_MS;

  const mergedByAuthor = new Map<string, string[]>();
  for (const pullRequest of pullRequests) {
    if (pullRequest.metadata.status !== 'merged') continue;
    if (!withinWindow(pullRequest.updatedAt, cutoff)) continue;
    const key = pullRequestAuthorKey(pullRequest);
    const list = mergedByAuthor.get(key) ?? [];
    if (list.length < SUMMARY_LIST_CAP) {
      list.push(pullRequest.metadata.name);
    }
    mergedByAuthor.set(key, list);
  }

  const digests: EngineerDigest[] = [];
  for (const bento of bentos) {
    if (bento.key === UNASSIGNED_KEY) continue;

    const parts: string[] = [];
    const merged = mergedByAuthor.get(bento.key);
    if (merged?.length) {
      parts.push(`MERGED (last ${days}d): ${merged.join(' | ')}`);
    }
    if (bento.openPullRequests.length) {
      const open = bento.openPullRequests
        .slice(0, SUMMARY_LIST_CAP)
        .map((pullRequest) => {
          const created = toTime(pullRequest.createdAt);
          const age =
            created !== undefined
              ? `${Math.max(0, Math.round((now.getTime() - created) / DAY_MS))}d`
              : '?';
          return `${pullRequest.metadata.name} (open ${age})`;
        });
      parts.push(`OPEN PRS: ${open.join(' | ')}`);
    }
    if (bento.openTasks.length) {
      const tasks = bento.openTasks
        .slice(0, SUMMARY_LIST_CAP)
        .map((task) => task.name);
      parts.push(`OPEN TASKS: ${tasks.join(' | ')}`);
    }

    if (parts.length === 0) continue;
    digests.push({
      key: bento.key,
      displayName: bento.displayName,
      digest: parts.join('\n'),
    });
  }

  return digests;
}
