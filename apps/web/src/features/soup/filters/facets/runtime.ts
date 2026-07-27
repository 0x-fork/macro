import { NIL_UUID } from '../facet-store';
import { facet } from './base';

/**
 * New Inbox read state is server-owned. Channel threads intentionally have no
 * seen clause because production only read-filters their parent channels.
 */
export const READ_STATE = facet({
  id: 'read_state',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'unread',
      clause: (b) => ({
        df: b.eq('documentSeen', false),
        ef: b.eq('emailSeen', false),
        chanf: b.eq('channelSeen', false),
        cf: b.eq('chatSeen', false),
        pf: b.eq('folderSeen', false),
        fef: b.eq('foreignEntitySeen', false),
      }),
    },
    {
      id: 'read',
      clause: (b) => ({
        df: b.eq('documentSeen', true),
        ef: b.eq('emailSeen', true),
        chanf: b.eq('channelSeen', true),
        cf: b.eq('chatSeen', true),
        pf: b.eq('folderSeen', true),
        fef: b.eq('foreignEntitySeen', true),
      }),
    },
  ],
});

/** Runtime channel-thread confinement or participant scope. */
export const CHANNEL_THREAD_SCOPE = facet({
  id: 'channel_thread_scope',
  mode: 'or',
  multiple: false,
  options: (optionId) => ({
    id: optionId,
    clause: (b) => ({
      cthf:
        optionId === NIL_UUID
          ? b.eq('channelThreadId', NIL_UUID)
          : b.eq('channelThreadParticipantId', optionId),
    }),
  }),
});
