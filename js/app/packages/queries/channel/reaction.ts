import { throwOnErr } from '@core/util/maybeResult';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { commsServiceClient } from '@service-comms/client';
import type { GetChannelResponse } from '@service-comms/generated/models';
import type { CountedReaction } from '@service-comms/generated/models/countedReaction';
import { raceTimeout } from '@solid-primitives/promise';
import { useMutation } from '@tanstack/solid-query';
import { untilMessage } from '@websocket';
import { ws, type FromWebsocketMessage } from '@service-connection/websocket';
import { queryClient } from '../client';
import { channelKeys } from './keys';

type ToggleReactionParams = {
  channelID: string;
  messageID: string;
  emoji: string;
  userID: string;
};

type ReactionAction = 'Add' | 'Remove';

type ToggleReactionContext = { action: ReactionAction };

function computeAction(
  prev: GetChannelResponse | undefined,
  vars: ToggleReactionParams
): ReactionAction {
  const existing = prev?.reactions?.[vars.messageID] ?? [];
  const row = existing.find((r) => r.emoji === vars.emoji);
  const didReact = !!row?.users?.includes(vars.userID);
  return didReact ? 'Remove' : 'Add';
}

type ReactionUpdatePayload = Readonly<{
  channel_id: string;
  message_id: string;
  reactions: CountedReaction[];
}>;

function safeParseJson(data: unknown): unknown | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

function isReactionUpdatePayload(x: unknown): x is ReactionUpdatePayload {
  if (!x || typeof x !== 'object') return false;
  const v = x as Record<string, unknown>;
  return (
    typeof v.channel_id === 'string' &&
    typeof v.message_id === 'string' &&
    Array.isArray(v.reactions)
  );
}

function didUserReact(
  reactions: readonly CountedReaction[],
  emoji: string,
  userID: string
): boolean {
  const row = reactions.find((r) => r.emoji === emoji);
  return !!row?.users?.includes(userID);
}

async function awaitReactionUpdate(params: {
  channelID: string;
  messageID: string;
  emoji: string;
  userID: string;
  expectedAction: ReactionAction;
  timeoutMs: number;
}): Promise<{ reactions: CountedReaction[] } | undefined> {
  const msg = await raceTimeout(
    untilMessage(ws, (m: FromWebsocketMessage) => {
      if (m.type !== 'comms_reaction' && m.type !== 'comms_reaction_update') {
        return false;
      }
      const raw = safeParseJson(m.data);
      if (!isReactionUpdatePayload(raw)) return false;
      if (raw.channel_id !== params.channelID) return false;
      if (raw.message_id !== params.messageID) return false;

      const reacted = didUserReact(raw.reactions, params.emoji, params.userID);
      return params.expectedAction === 'Add' ? reacted : !reacted;
    }),
    params.timeoutMs
  );

  if (!msg) return undefined;
  const raw = safeParseJson(msg.data);
  if (!isReactionUpdatePayload(raw)) return undefined;
  return { reactions: raw.reactions };
}

/**
 * Mutation to toggle a reaction for a message.
 * - Computes Add/Remove from current cached query data
 * - Sends mutation request
 * - Awaits websocket confirmation (untilMessage + timeout)
 */
export function useToggleReactionMutation(
  callbacks?: MutationCallbacks<
    void,
    Error,
    ToggleReactionParams,
    ToggleReactionContext
  >
) {
  return useMutation(() => ({
    mutationFn: async (vars: ToggleReactionParams) => {
      const prev = queryClient.getQueryData<GetChannelResponse>(
        channelKeys.withID(vars.channelID).queryKey
      );
      const action = computeAction(prev, vars);

      const updatePromise = awaitReactionUpdate({
        channelID: vars.channelID,
        messageID: vars.messageID,
        emoji: vars.emoji,
        userID: vars.userID,
        expectedAction: action,
        timeoutMs: 5000,
      });

      await throwOnErr(
        async () =>
          await commsServiceClient.postReaction({
            channel_id: vars.channelID,
            message_id: vars.messageID,
            emoji: vars.emoji,
            action,
          })
      );

      // Wait for server-confirmed reaction state via websocket update.
      const update = await updatePromise;
      if (!update) {
        throw new Error('Timed out waiting for reaction update');
      }
    },
    ...withCallbacks<void, Error, ToggleReactionParams, ToggleReactionContext>(
      {
        onMutate: async (vars) => {
          const prev = queryClient.getQueryData<GetChannelResponse>(
            channelKeys.withID(vars.channelID).queryKey
          );
          const action = computeAction(prev, vars);
          return { action };
        },
        onError: (error, _vars, _context) => {
          console.error('failed to react to message', error);
        },
      },
      callbacks
    ),
  }));
}
