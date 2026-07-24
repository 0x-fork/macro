import {
  documentFilter,
  fileFilter,
  githubPrFilter,
  notDoneFilter,
  peopleFilter,
  teamsFilter,
} from '../facet-predicates';
import { NIL_UUID } from '../facet-store';
import {
  explicitNoiseFilter,
  noiseFilter,
  signalFilter,
} from '../inbox-filters';
import { facet } from './base';

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
  id: 'entity_type',
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
      predicate: documentFilter,
    },
    {
      id: 'agent',
      clause: (b) => ({ cf: b.not(b.eq('chatId', NIL_UUID)) }),
      predicate: (e) => e.type === 'chat',
    },
    {
      id: 'people',
      clause: (b) => ({ chanf: b.eq('channelType', 'direct_message') }),
      predicate: peopleFilter,
    },
    {
      id: 'teams',
      clause: (b) => ({ chanf: b.not(b.eq('channelType', 'direct_message')) }),
      predicate: teamsFilter,
    },
    {
      id: 'task',
      clause: (b) => ({ df: b.eq('subType', 'task') }),
      predicate: (e) => e.type === 'document' && e.subType?.type === 'task',
    },
    {
      id: 'email',
      clause: (b) => ({ ef: b.and() }),
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
      predicate: fileFilter,
    },
    {
      id: 'github-pr',
      clause: (b) => ({ fef: b.not(b.eq('foreignEntityRecordId', NIL_UUID)) }),
      predicate: githubPrFilter,
    },
  ],
});
