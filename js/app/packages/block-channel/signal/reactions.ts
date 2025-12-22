import { withAnalytics } from '@coparse/analytics';
import { TrackingEvents } from '@coparse/analytics/src/types/TrackingEvents';
import { createBlockStore } from '@core/block';
import { useUserId } from '@service-gql/client';
import { channelStore } from './channel';

type CountedReaction = {
  emoji: string;
  users: string[];
};

export const messageToReactionStore = createBlockStore<Record<string, CountedReaction[]>>(
  {}
);

// Reaction writes are handled via query mutations (`@queries/channel/reaction`).
// This store is only for rendering and is hydrated from the channel query via `initializeChannelData`.

// Websocket-driven updates now happen in the query layer (`@queries/channel/realtime`),
// which patches the channel query cache (source of truth). This store is hydrated
// from the query via `initializeChannelData`.
