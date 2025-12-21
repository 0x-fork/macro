import { withAnalytics } from '@coparse/analytics';
import { TrackingEvents } from '@coparse/analytics/src/types/TrackingEvents';
import type { ChannelParticipant } from '@service-comms/generated/models/channelParticipant';
import {
  useAddParticipantsMutation,
  useRemoveParticipantsMutation,
} from '@queries/channel/participants';
import { channelStore } from './channel';

export function useAddParticipantsToChannel() {
  const [channel, setChannel] = channelStore;
  const { track } = withAnalytics();
  const mutation = useAddParticipantsMutation();

  return async (participants: string[]) => {
    const channelId = channel.channel?.id;
    if (!channelId) {
      console.error(
        'tried to add participants to a channel that does not exist'
      );
      return;
    }

    let newParticipants: ChannelParticipant[] = participants.map((p) => ({
      user_id: p,
      role: 'member',
      left_at: null,
      joined_at: new Date().toISOString(),
      channel_id: channelId,
    }));

    setChannel('participants', (prev) => [...prev, ...newParticipants]);

    try {
      await mutation.mutateAsync({
        channelID: channelId,
        participants,
      });
    } catch {
      // Mutation already handles user-visible errors via query callbacks.
    }

    track(TrackingEvents.BLOCKCHANNEL.PARTICIPANT.ADD);
  };
}

export function useRemoveParticipantsFromChannel() {
  const [channel, setChannel] = channelStore;
  const mutation = useRemoveParticipantsMutation();

  return async (participants: string[]) => {
    const channelId = channel.channel?.id;
    if (!channelId) {
      console.error(
        'tried to remove participants from a channel that does not exist'
      );
      return;
    }

    setChannel('participants', (prev) =>
      prev.filter((p) => !participants.includes(p.user_id))
    );

    try {
      await mutation.mutateAsync({
        channelID: channelId,
        participants,
      });
    } catch {
      // Mutation already handles user-visible errors via query callbacks.
    }
  };
}
