import { toast } from '@core/component/Toast/Toast';
import { throwOnErr } from '@core/util/maybeResult';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import { commsServiceClient } from '@service-comms/client';
import { useMutation } from '@tanstack/solid-query';
import { invalidateChannelWithID } from './channel';

type WithChannelID<T> = T & { channelID: string };

type AddParticipantsParams = WithChannelID<{ participants: string[] }>;

/**
 * Mutation to add participants to a channel.
 */
export function useAddParticipantsMutation(
  callbacks?: MutationCallbacks<void, Error, AddParticipantsParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: AddParticipantsParams) => {
      await throwOnErr(
        async () =>
          await commsServiceClient.addParticipantsToChanenl({
            channel_id: vars.channelID,
            participants: vars.participants,
          })
      );
    },
    ...withCallbacks<void, Error, AddParticipantsParams>(
      {
        onError(error) {
          console.error('failed to add participants', error);
          toast.failure('Failed to add participants to channel');
        },
        onSettled: (_data, _error, variables) => {
          invalidateChannelWithID(variables.channelID);
        },
      },
      callbacks
    ),
  }));
}

type RemoveParticipantsParams = WithChannelID<{ participants: string[] }>;

/**
 * Mutation to remove participants from a channel.
 */
export function useRemoveParticipantsMutation(
  callbacks?: MutationCallbacks<void, Error, RemoveParticipantsParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: RemoveParticipantsParams) => {
      await throwOnErr(
        async () =>
          await commsServiceClient.removeParticipantsFromChannel({
            channel_id: vars.channelID,
            participants: vars.participants,
          })
      );
    },
    ...withCallbacks<void, Error, RemoveParticipantsParams>(
      {
        onError(error) {
          console.error('failed to remove participants', error);
          toast.failure('Failed to remove participants from channel');
        },
        onSettled: (_data, _error, variables) => {
          invalidateChannelWithID(variables.channelID);
        },
      },
      callbacks
    ),
  }));
}


