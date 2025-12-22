import { createContext, useContext } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { CountedReaction } from '@service-comms/generated/models/countedReaction';

export type ChannelContextValue = {
  /** reactions grouped by message id */
  reactionsByMessageId: Accessor<Record<string, CountedReaction[]>>;
  /** typing state grouped by thread id (null = main channel) */
  usersTyping: Accessor<Map<string | null, Set<string>>>;
  postTypingUpdate: (params: { action: 'start' | 'stop'; threadId?: string }) => Promise<void>;
};

const ChannelContext = createContext<ChannelContextValue>();

export function useChannelContext() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error('useChannelContext must be used within ChannelContext.Provider');
  return ctx;
}

export const ChannelContextProvider = ChannelContext.Provider;


