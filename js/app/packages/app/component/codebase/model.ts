import type {
  GithubPullRequestEntity,
  TaskEntity,
  TaskEntityWithProperties,
} from '@entity/types/entity';
import { getTaskStatusOptionId } from '@entity/utils/task-properties';
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
