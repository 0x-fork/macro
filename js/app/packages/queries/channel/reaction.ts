import { TrackingEvents, withAnalytics } from '@coparse/analytics';
import { toast } from '@core/component/Toast/Toast';
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
import { setChannelMessageReactionsInCache } from './channel';
import { channelKeys } from './keys';

const { track } = withAnalytics();

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

function safeParse<T = any>(data: unknown): T | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    return JSON.parse(data) as T;
  } catch {
    return undefined;
  }
}

async function awaitReactionUpdate(params: {
  channelID: string;
  messageID: string;
  timeoutMs: number;
}): Promise<{ reactions: CountedReaction[] } | undefined> {
  const msg = await raceTimeout(
    untilMessage(ws, (m: FromWebsocketMessage) => {
      if (m.type !== 'comms_reaction' && m.type !== 'comms_reaction_update') {
        return false;
      }
      const value = safeParse<any>(m.data);
      if (!value || typeof value !== 'object') return false;
      if (value.channel_id !== params.channelID) return false;
      if (value.message_id !== params.messageID) return false;
      return Array.isArray(value.reactions);
    }),
    params.timeoutMs
  );

  if (!msg) return undefined;
  const value = safeParse<any>(msg.data);
  if (!value || !Array.isArray(value.reactions)) return undefined;
  return { reactions: value.reactions as CountedReaction[] };
}

/**
 * Mutation to toggle a reaction for a message.
 * - Computes Add/Remove from current cached query data
 * - Sends mutation request
 * - Awaits websocket confirmation (untilMessage + timeout)
 */
export function useToggleReactionMutation(
  callbacks?: MutationCallbacks<void, Error, ToggleReactionParams, ToggleReactionContext>
) {
  return useMutation(() => ({
    mutationFn: async (vars: ToggleReactionParams) => {
      const prev = queryClient.getQueryData<GetChannelResponse>(
        channelKeys.withID(vars.channelID).queryKey
      );
      const action = computeAction(prev, vars);
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
      const update = await awaitReactionUpdate({
        channelID: vars.channelID,
        messageID: vars.messageID,
        timeoutMs: 2500,
      });
      if (!update) {
        throw new Error('Timed out waiting for reaction update');
      }

      setChannelMessageReactionsInCache(vars.channelID, vars.messageID, update.reactions);

      // Track after confirmation (matches server action).
      track(TrackingEvents.BLOCKCHANNEL.MESSAGE.REACTION, {
        channelId: vars.channelID,
        emoji: vars.emoji,
        action,
      });
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
          toast.failure('Failed to react to message');
        },
      },
      callbacks
    ),
  }));
}


