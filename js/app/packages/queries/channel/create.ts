import { toast } from '@core/component/Toast/Toast';
import { throwOnErr } from '@core/util/maybeResult';
import { type MutationCallbacks, withCallbacks } from '@queries/utils';
import {
  commsServiceClient,
  type IdResponse,
} from '@service-comms/client';
import type { CreateChannelRequest } from '@service-comms/generated/models/createChannelRequest';
import { useMutation } from '@tanstack/solid-query';

/**
 * Mutation to create a channel.
 */
export function useCreateChannelMutation(
  callbacks?: MutationCallbacks<IdResponse, Error, CreateChannelRequest>
) {
  return useMutation(() => ({
    mutationFn: async (vars: CreateChannelRequest) =>
      await throwOnErr(async () => await commsServiceClient.createChannel(vars)),
    ...withCallbacks<IdResponse, Error, CreateChannelRequest>(
      {
        onError(error) {
          console.error('failed to create channel', error);
          toast.failure('Failed to create channel');
        },
      },
      callbacks
    ),
  }));
}


