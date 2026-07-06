import { PROPERTY_OPTION_IDS } from '@property/constants';
import { createMemo, type JSX } from 'solid-js';
import {
  StackedStatusBar,
  StatTile,
  WeeklyActivityChart,
  WeeklyActivityLegend,
} from './charts';
import { useCodebasePullRequests, useCodebaseTasks } from './data';
import {
  computeWeeklyPrActivity,
  countTasksByStatus,
  hasFailingChecks,
  pullRequestDisplayStatus,
} from './model';

const DAY_MS = 24 * 60 * 60 * 1000;

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

function Card(props: {
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

export function InsightsSection() {
  const { pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();

  const prStats = createMemo(() => {
    const stats = {
      open: 0,
      draft: 0,
      mergedLast30Days: 0,
      failingChecks: 0,
    };
    const mergedCutoff = Date.now() - 30 * DAY_MS;

    for (const pullRequest of pullRequests()) {
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
  });

  const openTaskCount = createMemo(
    () => tasks().filter((task) => !task.subType.is_completed).length
  );

  const weeklyActivity = createMemo(() =>
    computeWeeklyPrActivity(pullRequests())
  );

  const taskStatusSegments = createMemo(() => {
    const counts = countTasksByStatus(tasks());
    return TASK_STATUS_SEGMENTS.map((segment) => ({
      ...segment,
      count: counts.get(segment.key) ?? 0,
    }));
  });

  return (
    <div class="min-h-0 flex-1 overflow-y-auto @container">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
        <div class="grid grid-cols-2 gap-3 @2xl:grid-cols-4">
          <StatTile label="Open pull requests" value={prStats().open} />
          <StatTile label="Drafts" value={prStats().draft} />
          <StatTile
            label="Merged"
            value={prStats().mergedLast30Days}
            detail="last 30 days"
          />
          <StatTile
            label="Failing checks"
            value={prStats().failingChecks}
            detail="on open pull requests"
          />
        </div>

        <Card
          title="Pull request activity"
          subtitle="Opened vs merged per week, trailing 8 weeks"
          actions={<WeeklyActivityLegend />}
        >
          <WeeklyActivityChart data={weeklyActivity()} />
        </Card>

        <Card
          title="Task statuses"
          subtitle={`${openTaskCount()} open of ${tasks().length} recent tasks`}
        >
          <StackedStatusBar segments={taskStatusSegments()} />
        </Card>
      </div>
    </div>
  );
}
