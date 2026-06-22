// Search facets. TYPE is a single-select RESTRICT facet — "is this type" via the
// exclude pattern (idField ≠ NIL). Per-type sub-facets are scoped at compile by
// the consumer (pass only the active type's facets); the store retains all
// selections, so switching types rehydrates prior picks for free (no stash).
import { facet, NIL } from './base';

export const SEARCH_TYPE = facet({
  id: 'search-type',
  mode: 'or',
  multiple: false, // single-select; 'all' = nothing selected
  restrict: true,
  options: [
    { id: 'document-or-file', clause: (b) => ({ df: b.not(b.eq('subType', 'task')) }) },
    { id: 'task', clause: (b) => ({ df: b.eq('subType', 'task') }) },
    { id: 'email', clause: (b) => ({ ef: b.not(b.eq('threadId', NIL)) }) },
    { id: 'channels', clause: (b) => ({ chanf: b.not(b.eq('channelId', NIL)) }) },
    { id: 'calls', clause: (b) => ({ callf: b.not(b.eq('callId', NIL)) }) },
    { id: 'folders', clause: (b) => ({ pf: b.not(b.eq('folderId', NIL)) }) },
    { id: 'agent', clause: (b) => ({ cf: b.not(b.eq('chatId', NIL)) }) },
  ],
});

export const EMAIL_IMPORTANCE = facet({
  id: 'email-importance',
  mode: 'or',
  multiple: false,
  options: [{ id: 'important', clause: (b) => ({ ef: b.eq('emailImportance', true) }) }],
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

// NOTE: which sub-facets apply per search type (and per-view facet lists) is a
// consumer concern — compose `compileFacets(selection, [SEARCH_TYPE, …], ctx)`
// with the active type's sub-facets in the soup view, not here.
