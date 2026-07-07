import { For } from 'solid-js';
import { useCodebasePullRequests, useCodebaseTasks } from './data';
import {
  ActivityCard,
  AreaBreakdownCard,
  ChurnCard,
  ContributorsCard,
  CycleTimeCard,
  ProjectBreakdownCard,
  PrStatTiles,
  SizeDistributionCard,
  TaskStatusCard,
  VelocityCard,
  VelocityStatTiles,
} from './widgets';

/**
 * Single roomy column of plain (non-boxed) cards separated by hairline
 * dividers — charts get the full content width and generous breathing room.
 */
export function InsightsSection() {
  const { pullRequests } = useCodebasePullRequests();
  const { tasks } = useCodebaseTasks();

  const cards = [
    () => <ActivityCard pullRequests={pullRequests()} inset={false} />,
    () => <VelocityCard pullRequests={pullRequests()} inset={false} />,
    () => <CycleTimeCard pullRequests={pullRequests()} inset={false} />,
    () => <ChurnCard pullRequests={pullRequests()} inset={false} />,
    () => <SizeDistributionCard pullRequests={pullRequests()} inset={false} />,
    () => <AreaBreakdownCard pullRequests={pullRequests()} inset={false} />,
    () => <ProjectBreakdownCard pullRequests={pullRequests()} inset={false} />,
    () => <ContributorsCard pullRequests={pullRequests()} inset={false} />,
    () => <TaskStatusCard tasks={tasks()} inset={false} />,
  ];

  return (
    <div class="min-h-0 flex-1 overflow-y-auto @container">
      <div class="mx-auto flex w-full max-w-3xl flex-col px-6 py-8">
        <PrStatTiles
          pullRequests={pullRequests()}
          extra={<VelocityStatTiles pullRequests={pullRequests()} />}
        />
        <div class="mt-4 flex flex-col divide-y divide-edge-muted">
          <For each={cards}>
            {(card) => <div class="py-9 first:pt-6 last:pb-16">{card()}</div>}
          </For>
        </div>
      </div>
    </div>
  );
}
