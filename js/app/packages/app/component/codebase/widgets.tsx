import type { GithubPullRequestEntity, TaskEntity } from '@entity';
import { PROPERTY_OPTION_IDS } from '@property/constants';
import { createMemo, type JSX } from 'solid-js';
import {
  StackedStatusBar,
  StatTile,
  WeeklyActivityChart,
  WeeklyActivityLegend,
} from './charts';
import {
  computePrStats,
  computeWeeklyPrActivity,
  countTasksByStatus,
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
