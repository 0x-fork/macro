import { useCodebasePullRequests, useCodebaseTasks } from './data';
import { ActivityCard, PrStatTiles, TaskStatusCard } from './widgets';

export function InsightsSection() {
  const { pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();

  return (
    <div class="min-h-0 flex-1 overflow-y-auto @container">
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-3 px-3 py-3">
        <PrStatTiles pullRequests={pullRequests()} />
        <ActivityCard pullRequests={pullRequests()} />
        <TaskStatusCard tasks={tasks()} />
      </div>
    </div>
  );
}
