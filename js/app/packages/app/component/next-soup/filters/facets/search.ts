import {
  isCallEntity,
  isChannelEntity,
  isDocumentEntity,
  isEmailEntity,
  isTaskEntity,
} from '@entity';
import { NIL_UUID } from '../facet-store';
import { facet } from './base';

export const SEARCH_TYPE = facet({
  id: 'search-type',
  mode: 'or',
  multiple: false, // single-select; 'all' = nothing selected
  restrict: true,
  options: [
    {
      id: 'document-or-file',
      clause: (b) => ({ df: b.not(b.eq('subType', 'task')) }),
      predicate: (e) => isDocumentEntity(e) && !isTaskEntity(e),
    },
    {
      id: 'task',
      clause: (b) => ({ df: b.eq('subType', 'task') }),
      predicate: isTaskEntity,
    },
    { id: 'email', clause: (b) => ({ ef: b.and() }), predicate: isEmailEntity },
    {
      id: 'channels',
      clause: (b) => ({ chanf: b.not(b.eq('channelId', NIL_UUID)) }),
      predicate: isChannelEntity,
    },
    {
      id: 'calls',
      clause: (b) => ({ callf: b.not(b.eq('callId', NIL_UUID)) }),
      predicate: isCallEntity,
    },
    {
      id: 'folders',
      clause: (b) => ({ pf: b.not(b.eq('folderId', NIL_UUID)) }),
    },
    {
      id: 'agent',
      clause: (b) => ({ cf: b.not(b.eq('chatId', NIL_UUID)) }),
      predicate: (e) => e.type === 'chat',
    },
  ],
});

export const EMAIL_IMPORTANCE = facet({
  id: 'email-importance',
  mode: 'or',
  multiple: false,
  options: [
    { id: 'important', clause: (b) => ({ ef: b.eq('emailImportance', true) }) },
  ],
});

// open id spaces (search boxes): each picked id resolves to its clause
export const EMAIL_INBOX = facet({
  id: 'email-inbox',
  mode: 'or',
  options: (inboxId) => ({
    id: inboxId,
    clause: (b) => ({ ef: b.eq('emailLinkId', inboxId) }),
  }),
});

export const CHANNEL_IN = facet({
  id: 'channel-in',
  mode: 'or',
  options: (channelId) => ({
    id: channelId,
    clause: (b) => ({ chanf: b.eq('channelId', channelId) }),
  }),
});

export const CHANNEL_FROM = facet({
  id: 'channel-from',
  mode: 'or',
  options: (senderId) => ({
    id: senderId,
    clause: (b) => ({ chanf: b.eq('channelSenderId', senderId) }),
  }),
});

export const CALL_IN = facet({
  id: 'call-in',
  mode: 'or',
  options: (channelId) => ({
    id: channelId,
    clause: (b) => ({ callf: b.eq('callChannelId', channelId) }),
  }),
});

export const CALL_FROM = facet({
  id: 'call-from',
  mode: 'or',
  options: (speakerId) => ({
    id: speakerId,
    clause: (b) => ({ callf: b.eq('callSpeakerId', speakerId) }),
  }),
});

export const CALL_STATUS = facet({
  id: 'call-status',
  mode: 'or',
  multiple: false,
  options: (status) => ({
    id: status,
    clause: (b) => ({ callf: b.eq('callStatus', status) }),
  }),
});

export const TASK_CREATED_BY = facet({
  id: 'task-created-by',
  mode: 'or',
  options: (userId) => ({
    id: userId,
    clause: (b) => ({ df: b.eq('documentOwnerId', userId) }),
  }),
});
