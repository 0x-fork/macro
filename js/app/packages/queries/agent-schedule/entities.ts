import type { AutomationEntity } from '@entity';
import type { ScheduledAction } from '@service-scheduled-action/generated/schemas';
import { createMemo } from 'solid-js';
import { useSchedulesQuery } from './schedules';

function scheduleToEntity(
  schedule: ScheduledAction
): AutomationEntity | undefined {
  if (!schedule.id) return undefined;
  return {
    id: schedule.id,
    type: 'automation',
    name: schedule.name,
    ownerId: schedule.owner,
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
    cron: schedule.schedule,
    enabled: schedule.enabled,
    nextRunAt: schedule.next_run_at,
  };
}

/**
 * Reactive list of automation entities derived from the scheduled-action
 * query. Safe to call from any component tree that's under a QueryClient —
 * returns `[]` until the query resolves.
 */
export function useAutomationEntities() {
  const schedulesQuery = useSchedulesQuery(() => true);
  return createMemo<AutomationEntity[]>(() => {
    const data = schedulesQuery.data;
    if (!data) return [];
    const out: AutomationEntity[] = [];
    for (const schedule of data) {
      const entity = scheduleToEntity(schedule);
      if (entity) out.push(entity);
    }
    return out;
  });
}
