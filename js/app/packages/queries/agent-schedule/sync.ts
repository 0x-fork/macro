import { queryClient } from '@queries/client';
import { createConnectionWebsocketEffect } from '@service-connection/websocket';
import type {
  ActionExecutionRecord,
  ScheduledAction,
} from '@service-scheduled-action/generated/schemas';
import { scheduledActionKeys } from './keys';

const STARTED = 'scheduled_action_started';
const STOPPED = 'scheduled_action_stopped';

type StartedPayload = { action_id: string; chat_id: string };
type StoppedPayload = {
  action_id: string;
  chat_id: string;
  is_success: boolean;
};

function parsePayload<T>(data: unknown): T | undefined {
  try {
    return typeof data === 'string' ? (JSON.parse(data) as T) : (data as T);
  } catch (e) {
    console.warn('scheduled-action live update: unparsable payload', data, e);
    return undefined;
  }
}

function patchClaimed(actionId: string, claimed: string | null) {
  queryClient.setQueryData(
    scheduledActionKeys.list.queryKey,
    (current: ScheduledAction[] | undefined) => {
      if (!current) return current;
      const idx = current.findIndex((a) => a.id === actionId);
      if (idx === -1) return current;
      const next = [...current];
      next[idx] = { ...next[idx], claimed: claimed ?? undefined };
      return next;
    }
  );
}

function upsertPendingHistoryRow(payload: StartedPayload) {
  queryClient.setQueryData(
    scheduledActionKeys.history({ scheduleId: payload.action_id }).queryKey,
    (current: ActionExecutionRecord[] | undefined) => {
      const synthetic: ActionExecutionRecord = {
        action_id: payload.action_id,
        resource_id: payload.chat_id,
        start_time: new Date().toISOString(),
        // `end_time` is not nullable on the server record, but the stop event
        // triggers a refetch which replaces this synthetic row with the real
        // persisted one. We flag it as pending via `id: undefined` and
        // `is_success: false` — the UI checks for the missing id to render
        // the running affordance rather than a final state.
        end_time: new Date().toISOString(),
        is_success: false,
        result: {},
        created_at: new Date().toISOString(),
      };
      if (!current) return [synthetic];
      // Replace any existing pending row for this chat_id; otherwise prepend.
      const existingIdx = current.findIndex(
        (r) => !r.id && r.resource_id === payload.chat_id
      );
      if (existingIdx !== -1) {
        const next = [...current];
        next[existingIdx] = synthetic;
        return next;
      }
      return [synthetic, ...current];
    }
  );
}

function removePendingHistoryRow(chatId: string, scheduleId: string) {
  queryClient.setQueryData(
    scheduledActionKeys.history({ scheduleId }).queryKey,
    (current: ActionExecutionRecord[] | undefined) => {
      if (!current) return current;
      return current.filter((r) => !(!r.id && r.resource_id === chatId));
    }
  );
}

createConnectionWebsocketEffect((data) => {
  if (data.type === STARTED) {
    const payload = parsePayload<StartedPayload>(data.data);
    if (!payload) return;
    patchClaimed(payload.action_id, new Date().toISOString());
    upsertPendingHistoryRow(payload);
    return;
  }
  if (data.type === STOPPED) {
    const payload = parsePayload<StoppedPayload>(data.data);
    if (!payload) return;
    patchClaimed(payload.action_id, null);
    // Drop the synthetic pending row immediately so the UI stops showing it
    // as running; the invalidate below refetches the server-persisted record
    // (with `end_time`, `is_success`, and a real `id`) to take its place.
    removePendingHistoryRow(payload.chat_id, payload.action_id);
    queryClient.invalidateQueries({
      queryKey: scheduledActionKeys.history({
        scheduleId: payload.action_id,
      }).queryKey,
    });
  }
});
