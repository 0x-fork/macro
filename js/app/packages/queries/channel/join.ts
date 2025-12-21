import { toast } from '@core/component/Toast/Toast';
import { throwOnErr } from '@core/util/maybeResult';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { commsServiceClient } from '@service-comms/client';
import { useMutation } from '@tanstack/solid-query';
import { invalidateChannelWithID } from './channel';

type JoinChannelParams = { channelID: string };

/**
 * Mutation to join a channel.
 */
export function useJoinChannelMutation(
  callbacks?: MutationCallbacks<void, Error, JoinChannelParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: JoinChannelParams) => {
      await throwOnErr(
        async () =>
          await commsServiceClient.joinChannel({
            channel_id: vars.channelID,
          })
      );
    },
    ...withCallbacks<void, Error, JoinChannelParams>(
      {
        onError(error) {
          console.error('failed to join channel', error);
          toast.failure('Failed to join channel');
        },
        onSettled: (_data, _error, variables) => {
          invalidateChannelWithID(variables.channelID);
        },
      },
      callbacks
    ),
  }));
}


