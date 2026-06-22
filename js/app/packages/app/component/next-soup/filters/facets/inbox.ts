// Inbox "Type" — a RESTRICT facet (confines visible entity types). Each option
// encodes both the backend clause (built via `b`, no imports) and the client
// predicate. "Is this type" uses the exclude pattern (idField ≠ NIL).
// (Predicates here are illustrative; production wires the real ones from `../predicates`.)
import {
  explicitNoiseFilter,
  noiseFilter,
  signalFilter,
} from '../inbox-filters';
import { notDoneFilter } from '../predicates';
import { facet, NIL } from './base';

// Inbox "focus" — a single-select preset facet (predicate-only; the backend
// baseline lives in the tab preset). Reuses the existing signal/noise predicates.
export const INBOX_FOCUS = facet({
  id: 'focus',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'inbox',
      predicate: (e, ctx) =>
        signalFilter(e) &&
        (ctx.notificationSource
          ? notDoneFilter(ctx.notificationSource)(e)
          : false),
    },
    { id: 'noise', predicate: (e) => noiseFilter(e) },
    { id: 'explicit-noise', predicate: (e) => !explicitNoiseFilter(e) },
  ],
});

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
          b.or(
            b.eq('fileAssoc', 'assoc:md'),
            b.eq('fileAssoc', 'assoc:canvas')
          ),
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
      predicate: (e) =>
        e.type === 'channel' && e.channelType === 'direct_message',
    },
    {
      id: 'teams',
      clause: (b) => ({ chanf: b.not(b.eq('channelType', 'direct_message')) }),
      predicate: (e) =>
        e.type === 'channel' && e.channelType !== 'direct_message',
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
