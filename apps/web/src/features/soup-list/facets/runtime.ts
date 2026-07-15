import { unreadFilter } from '../facet-predicates';
import { NIL_UUID } from '../facet-store';
import { facet } from './base';

/** Read state across every entity target supported by notification filtering. */
export const READ_STATE = facet({
  id: 'read-state',
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
      predicate: (entity, ctx) =>
        ctx.notificationSource
          ? unreadFilter(ctx.notificationSource)(entity)
          : true,
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
      predicate: (entity, ctx) =>
        ctx.notificationSource
          ? !unreadFilter(ctx.notificationSource)(entity)
          : true,
    },
  ],
});

/** Runtime channel-thread confinement or participant scope. */
export const CHANNEL_THREAD_SCOPE = facet({
  id: 'channel-thread-scope',
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
