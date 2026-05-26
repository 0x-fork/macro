import { createConnectionWebsocketEffect } from '@service-connection/websocket';
import { parseWebsocketPayload } from '@service-connection/websocketPayload';
import { match } from 'ts-pattern';
import { z } from 'zod';
import { useCallContext } from './CallContext';

type CallShareWithTeamToggledPayload = {
  call_id: string;
  channel_id: string;
  share_with_team: boolean;
  toggled_by: string | null;
};

const callShareWithTeamToggledPayloadSchema = z
  .object({
    call_id: z.string(),
    channel_id: z.string(),
    share_with_team: z.boolean(),
    toggled_by: z.string().nullable(),
  })
  .passthrough() satisfies z.ZodType<CallShareWithTeamToggledPayload>;

/**
 * Applies connection-gateway events that mutate active-call state held in
 * `CallContext`. Must be rendered inside `<CallProvider />`.
 *
 * Handled events:
 *  - `call_share_with_team_toggled` — keeps `isSharedWithTeam` in sync when
 *    the flag is flipped by another participant (or by the same user on a
 *    different device). Skipped when the payload's `call_id` does not match
 *    the currently active call, since the flag is only tracked while the
 *    user is in that call.
 */
export function CallEventSync() {
  const callCtx = useCallContext();

  createConnectionWebsocketEffect((data) => {
    match(data)
      .with({ type: 'call_share_with_team_toggled' }, () => {
        const payload = parseWebsocketPayload(
          data.type,
          data.data,
          callShareWithTeamToggledPayloadSchema
        );
        if (!payload) return;
        if (payload.call_id !== callCtx.activeCallId()) return;
        callCtx.setSharedWithTeam(payload.share_with_team);
      })
      .otherwise(() => {});
  });

  return null;
}
