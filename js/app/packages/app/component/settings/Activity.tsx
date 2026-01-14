import { For, Show, createMemo } from 'solid-js';
import {
  useTodayPoints,
  useLifetimePoints,
  useRecentActivities,
  usePointsChartData,
  useInitializeActivityLogger,
  ACTIVITY_LABELS,
  type ActivityEntry,
} from '@macro/activity-logger';

/**
 * Format a timestamp to a readable time string
 */
function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format points with commas for readability
 */
function formatPoints(points: number): string {
  return points.toLocaleString();
}

/**
 * Simple bar chart component for visualizing points over time
 */
function PointsChart() {
  const chartData = usePointsChartData(7);

  const maxPoints = createMemo(() => {
    const max = Math.max(...chartData().map((d) => d.points), 1);
    return max;
  });

  return (
    <div class="flex flex-col gap-2">
      <div class="text-xs text-ink-faint uppercase tracking-wider">Last 7 Days</div>
      <div class="flex items-end gap-1 h-24">
        <For each={chartData()}>
          {(day) => {
            const heightPercent = createMemo(() =>
              Math.max((day.points / maxPoints()) * 100, 2)
            );
            const isToday = day.label === 'Today';

            return (
              <div class="flex-1 flex flex-col items-center gap-1">
                <div
                  class="w-full rounded-t transition-all duration-300"
                  classList={{
                    'bg-accent': isToday,
                    'bg-accent/40': !isToday,
                  }}
                  style={{ height: `${heightPercent()}%` }}
                  title={`${day.label}: ${formatPoints(day.points)} pts`}
                />
                <div
                  class="text-[10px] truncate max-w-full"
                  classList={{
                    'text-accent font-medium': isToday,
                    'text-ink-faint': !isToday,
                  }}
                >
                  {day.label.slice(0, 3)}
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}

/**
 * Activity feed item component
 */
function ActivityItem(props: { entry: ActivityEntry }) {
  const label = ACTIVITY_LABELS[props.entry.type] ?? props.entry.type;

  return (
    <div class="flex items-center justify-between py-1.5 border-b border-edge-muted last:border-0">
      <div class="flex flex-col gap-0.5">
        <span class="text-sm">{label}</span>
        <span class="text-xs text-ink-faint">{formatTime(props.entry.timestamp)}</span>
      </div>
      <div class="text-sm font-medium text-accent">+{formatPoints(props.entry.points)}</div>
    </div>
  );
}

/**
 * Activity feed showing recent activities
 */
function ActivityFeed() {
  const activities = useRecentActivities(15);

  return (
    <div class="flex flex-col gap-2 flex-1 min-h-0">
      <div class="text-xs text-ink-faint uppercase tracking-wider">Recent Activity</div>
      <div class="flex-1 overflow-auto">
        <Show
          when={activities().length > 0}
          fallback={
            <div class="text-sm text-ink-faint py-4 text-center">
              No activity logged yet today. Start working to earn points!
            </div>
          }
        >
          <For each={activities()}>{(entry) => <ActivityItem entry={entry} />}</For>
        </Show>
      </div>
    </div>
  );
}

/**
 * Points summary card
 */
function PointsSummary() {
  const todayPoints = useTodayPoints();
  const lifetimePoints = useLifetimePoints();

  return (
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-panel-alt rounded-lg p-4 flex flex-col gap-1">
        <div class="text-xs text-ink-faint uppercase tracking-wider">Today</div>
        <div class="text-2xl font-bold text-accent">{formatPoints(todayPoints())}</div>
        <div class="text-xs text-ink-faint">points</div>
      </div>
      <div class="bg-panel-alt rounded-lg p-4 flex flex-col gap-1">
        <div class="text-xs text-ink-faint uppercase tracking-wider">Lifetime</div>
        <div class="text-2xl font-bold">{formatPoints(lifetimePoints())}</div>
        <div class="text-xs text-ink-faint">points</div>
      </div>
    </div>
  );
}

/**
 * Activity settings tab component
 * Shows productivity points and activity log
 */
export function Activity() {
  // Initialize activity tracking (passive time, keystrokes)
  useInitializeActivityLogger();

  return (
    <div class="font-mono flex flex-col gap-4 text-sm p-3 h-full">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div>
          <div class="text-lg font-bold">Activity</div>
          <div class="text-xs text-ink-faint">Track your daily productivity</div>
        </div>
      </div>

      {/* Points Summary */}
      <PointsSummary />

      {/* Chart */}
      <div class="bg-panel-alt rounded-lg p-4">
        <PointsChart />
      </div>

      {/* Activity Feed */}
      <div class="bg-panel-alt rounded-lg p-4 flex-1 min-h-0 flex flex-col">
        <ActivityFeed />
      </div>

      {/* Point values info */}
      <div class="text-xs text-ink-faint">
        <details>
          <summary class="cursor-pointer hover:text-ink">Point Values</summary>
          <div class="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 pl-2">
            <span>Email sent</span><span class="text-right">5,000</span>
            <span>Inbox zero</span><span class="text-right">10,000</span>
            <span>Message sent</span><span class="text-right">500</span>
            <span>Document shared</span><span class="text-right">1,000</span>
            <span>File created</span><span class="text-right">100</span>
            <span>Task completed</span><span class="text-right">10</span>
            <span>Typing (input)</span><span class="text-right">10/key</span>
            <span>Keystroke</span><span class="text-right">1/key</span>
            <span>Active time</span><span class="text-right">10/min</span>
          </div>
        </details>
      </div>
    </div>
  );
}
