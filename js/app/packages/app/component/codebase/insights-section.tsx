import { useCodebasePullRequests, useCodebaseTasks } from './data';
import {
  ActivityCard,
  AreaBreakdownCard,
  ChurnCard,
  ContributorsCard,
  ProjectBreakdownCard,
  PrStatTiles,
  SizeDistributionCard,
  TaskStatusCard,
  VelocityCard,
  VelocityStatTiles,
} from './widgets';

export function InsightsSection() {
  const { pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();

  return (
    <div class="min-h-0 flex-1 overflow-y-auto @container">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-3">
        <PrStatTiles
          pullRequests={pullRequests()}
          extra={<VelocityStatTiles pullRequests={pullRequests()} />}
        />

        <div class="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
          <ActivityCard pullRequests={pullRequests()} />
          <VelocityCard pullRequests={pullRequests()} />
          <ChurnCard pullRequests={pullRequests()} />
          <TaskStatusCard tasks={tasks()} />
          <SizeDistributionCard pullRequests={pullRequests()} />
          <AreaBreakdownCard pullRequests={pullRequests()} />
          <ProjectBreakdownCard pullRequests={pullRequests()} />
          <ContributorsCard pullRequests={pullRequests()} />
        </div>
      </div>
    </div>
  );
}
