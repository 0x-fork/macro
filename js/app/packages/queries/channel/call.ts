import {
  throwOnErr,
  type MaybeResult,
  ok,
  isErr,
  catchToResult,
} from '@core/util/maybeResult';
import {
  commsServiceClient,
  type ChannelCallState,
  type ChannelCallType,
  type JoinChannelCallResponse,
} from '@service-comms/client';
import {
  type QueryClient,
  type UseBaseQueryOptions,
  useMutation,
  useQuery,
} from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';
import { queryClient } from '../client';
import { channelKeys } from './keys';

type ChannelCallQueryOptions = UseBaseQueryOptions<ChannelCallState, Error>;

export function channelCallQueryOptions(
  channelId: string
): ChannelCallQueryOptions {
  return {
    queryKey: channelKeys.call(channelId).queryKey,
    queryFn: async () =>
      await throwOnErr(
        async () =>
          await commsServiceClient.getChannelCall({ channel_id: channelId })
      ),
    staleTime: 5_000,
    refetchInterval: (query) =>
      query.state.data?.status === 'active' ? 5_000 : false,
  };
}

export function useChannelCallQuery(
  channelId: Accessor<string>,
  options?: Accessor<Omit<ChannelCallQueryOptions, 'queryKey' | 'queryFn'>>,
  localQueryClient?: Accessor<QueryClient>
) {
  return useQuery(() => {
    return {
      initialData: undefined,
      ...options?.(),
      ...channelCallQueryOptions(channelId()),
    };
  }, localQueryClient);
}

export function invalidateChannelCall(channelId: string) {
  queryClient.invalidateQueries({
    queryKey: channelKeys.call(channelId).queryKey,
  });
}

function makeInactiveChannelCallState(channelId: string): ChannelCallState {
  return {
    channel_id: channelId,
    status: 'inactive',
    room_name: null,
    call_type: null,
    started_at: null,
    created_by: null,
    participant_count: 0,
    participants: [],
  };
}

type CreateChannelCallVars = {
  channelId: string;
  callType: ChannelCallType;
};

export function useCreateChannelCallMutation() {
  return useMutation(() => ({
    mutationFn: async (
      vars: CreateChannelCallVars
    ): Promise<JoinChannelCallResponse> =>
      await throwOnErr(
        async () =>
          await commsServiceClient.createChannelCall({
            channel_id: vars.channelId,
            call_type: vars.callType,
          })
      ),
    onSuccess: (data, vars) => {
      queryClient.setQueryData(channelKeys.call(vars.channelId).queryKey, data.call);
    },
  }));
}

type EndChannelCallVars = {
  channelId: string;
};

export function useEndChannelCallMutation() {
  return useMutation(() => ({
    mutationFn: async (vars: EndChannelCallVars) =>
      await throwOnErr(
        async () =>
          await commsServiceClient.endChannelCall({
            channel_id: vars.channelId,
          })
      ),
    onSuccess: (_data, vars) => {
      queryClient.setQueryData(
        channelKeys.call(vars.channelId).queryKey,
        makeInactiveChannelCallState(vars.channelId)
      );
    },
  }));
}

export async function fetchAndCacheChannelCall(
  channelId: string
): Promise<MaybeResult<string, { call: ChannelCallState }>> {
  const result = await catchToResult(
    async () => await queryClient.ensureQueryData(channelCallQueryOptions(channelId))
  );

  if (isErr(result)) {
    return result;
  }

  return ok({ call: result[1] });
}
