import type { EntityData } from '@entity';
import { NIL_UUID } from '../facet-store';
import { facet, selectProp } from './base';

const isTask = (entity: EntityData) =>
  entity.type === 'document' && entity.subType?.type === 'task';
const isChannel = (entity: EntityData) =>
  entity.type === 'channel' ||
  entity.type === 'channel_message' ||
  entity.type === 'channel_thread';

export const SEARCH_TYPE = facet({
  id: 'search_type',
  mode: 'or',
  multiple: false, // single-select; 'all' = nothing selected
  restrict: true,
  options: [
    {
      id: 'document-or-file',
      clause: (b) => ({ df: b.not(b.eq('subType', 'task')) }),
      predicate: (entity) => entity.type === 'document' && !isTask(entity),
    },
    {
      id: 'task',
      clause: (b) => ({ df: b.eq('subType', 'task') }),
      predicate: isTask,
    },
    {
      id: 'email',
      clause: (b) => ({ ef: b.and() }),
      predicate: (entity) => entity.type === 'email',
    },
    {
      id: 'channels',
      clause: (b) => ({ chanf: b.not(b.eq('channelId', NIL_UUID)) }),
      predicate: isChannel,
    },
    {
      id: 'calls',
      clause: (b) => ({ callf: b.not(b.eq('callId', NIL_UUID)) }),
      predicate: (entity) => entity.type === 'call',
    },
    {
      id: 'folders',
      clause: (b) => ({ pf: b.not(b.eq('folderId', NIL_UUID)) }),
      predicate: (entity) => entity.type === 'project',
    },
    {
      id: 'agent',
      clause: (b) => ({ cf: b.not(b.eq('chatId', NIL_UUID)) }),
      predicate: (e) => e.type === 'chat',
    },
    {
      id: 'doc-snippet',
      clause: (b) => ({
        df: b.and(b.eq('fileType', 'md'), b.eq('subType', 'snippet')),
      }),
      predicate: (entity) =>
        entity.type === 'document' && entity.subType?.type === 'snippet',
    },
    {
      id: 'github-pr',
      clause: (b) => ({
        fef: b.eq('foreignEntitySource', 'github_pull_request'),
      }),
      predicate: (entity) =>
        entity.type === 'foreign' &&
        entity.foreignSource === 'github_pull_request',
    },
  ],
});

export const EMAIL_IMPORTANCE = facet({
  id: 'email_importance',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'important',
      clause: (b) => ({ ef: b.eq('emailImportance', true) }),
      predicate: (entity) => entity.type === 'email' && entity.isImportant,
    },
    {
      id: 'noise',
      clause: (b) => ({ ef: b.eq('emailImportance', false) }),
      predicate: (entity) => entity.type === 'email' && !entity.isImportant,
    },
  ],
});

// open id spaces (search boxes): each picked id resolves to its clause
export const EMAIL_INBOX = facet({
  id: 'email_inbox',
  mode: 'or',
  options: (inboxId) => ({
    id: inboxId,
    clause: (b) => ({ ef: b.eq('emailLinkId', inboxId) }),
  }),
});

export const CHANNEL_IN = facet({
  id: 'channel_in',
  mode: 'or',
  options: (channelId) => ({
    id: channelId,
    clause: (b) => ({ chanf: b.eq('channelId', channelId) }),
  }),
});

export const CHANNEL_FROM = facet({
  id: 'channel_from',
  mode: 'or',
  options: (senderId) => ({
    id: senderId,
    clause: (b) => ({ chanf: b.eq('channelSenderId', senderId) }),
  }),
});

export const CALL_IN = facet({
  id: 'call_in',
  mode: 'or',
  options: (channelId) => ({
    id: channelId,
    clause: (b) => ({ callf: b.eq('callChannelId', channelId) }),
  }),
});

export const CALL_FROM = facet({
  id: 'call_from',
  mode: 'or',
  options: (speakerId) => ({
    id: speakerId,
    clause: (b) => ({ callf: b.eq('callSpeakerId', speakerId) }),
  }),
});

export const CALL_STATUS = facet({
  id: 'call_status',
  mode: 'or',
  multiple: false,
  options: (status) => ({
    id: status,
    clause: (b) => ({ callf: b.eq('callStatus', status) }),
  }),
});

export const TASK_CREATED_BY = facet({
  id: 'task_created_by',
  mode: 'or',
  options: (userId) => ({
    id: userId,
    clause: (b) => ({ df: b.eq('documentOwnerId', userId) }),
  }),
});

// Selected tag option ids (open id space). The `tag_mode` facet switches this
// group between any-of (OR) and all-of (AND) while it continues to AND with
// status/priority groups. The owning definition id comes
// from `ctx.tagDefs` (option ids are unique, but the backend literal needs it);
// unloaded options resolve to no clause. Search reads the raw selection as
// `tag_option_ids` and ignores this clause.
export const TAG_MODE = facet({
  id: 'tag_mode',
  mode: 'or',
  multiple: false,
  options: [{ id: 'all' }],
});

export const TAG = facet({
  id: 'tag',
  mode: (ctx) => (ctx.tagMode === 'all' ? 'and' : 'or'),
  options: (optionId, ctx) => {
    const propertyId = ctx.tagDefs?.get(optionId);
    return {
      id: optionId,
      clause: propertyId ? selectProp(propertyId, optionId) : undefined,
    };
  },
});
