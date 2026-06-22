// Inbox "Type" — a RESTRICT facet (confines visible entity types). Each option
// encodes both the backend clause (built via `b`, no imports) and the client
// predicate. "Is this type" uses the exclude pattern (idField ≠ NIL).
// (Predicates here are illustrative; production wires the real ones from `../predicates`.)
import { facet, NIL } from './base';

export const ENTITY_TYPE = facet({
  id: 'entity-type',
  mode: 'or',
  multiple: true,
  restrict: true,
  options: [
    {
      id: 'document',
      clause: (b) => ({
        df: b.and(
          b.or(b.eq('fileAssoc', 'assoc:md'), b.eq('fileAssoc', 'assoc:canvas')),
          b.not(b.eq('subType', 'task'))
        ),
      }),
      predicate: (e) => e.type === 'document' && e.subType?.type !== 'task',
    },
    {
      id: 'agent',
      clause: (b) => ({ cf: b.not(b.eq('chatId', NIL)) }),
      predicate: (e) => e.type === 'chat',
    },
    {
      id: 'people',
      clause: (b) => ({ chanf: b.eq('channelType', 'direct_message') }),
      predicate: (e) => e.type === 'channel' && e.channelType === 'direct_message',
    },
    {
      id: 'teams',
      clause: (b) => ({ chanf: b.not(b.eq('channelType', 'direct_message')) }),
      predicate: (e) => e.type === 'channel' && e.channelType !== 'direct_message',
    },
    {
      id: 'task',
      clause: (b) => ({ df: b.eq('subType', 'task') }),
      predicate: (e) => e.type === 'document' && e.subType?.type === 'task',
    },
    {
      id: 'email',
      clause: (b) => ({ ef: b.not(b.eq('threadId', NIL)) }),
      predicate: (e) => e.type === 'email',
    },
    {
      id: 'file',
      clause: (b) => ({
        df: b.and(
          b.not(b.eq('fileAssoc', 'assoc:md')),
          b.not(b.eq('fileAssoc', 'assoc:canvas')),
          b.not(b.eq('subType', 'task'))
        ),
      }),
      // client distinction is richer; server query is sufficient here
    },
    {
      id: 'github-pr',
      clause: (b) => ({ fef: b.not(b.eq('foreignEntityRecordId', NIL)) }),
      predicate: (e) => e.type === 'foreignEntity',
    },
  ],
});
