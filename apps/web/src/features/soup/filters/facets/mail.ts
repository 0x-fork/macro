import {
  emailDraftsFilter,
  hasCalendarInviteFilter,
  hasDocumentAttachmentFilter,
  hasImageAttachmentFilter,
  hasPdfAttachmentFilter,
  noDraftsFilter,
} from '../predicates';
import { facet } from './base';

export const MAIL_DRAFTS = facet({
  id: 'drafts',
  mode: 'or',
  multiple: false,
  options: [
    { id: 'no-drafts', predicate: (e) => noDraftsFilter(e) },
    { id: 'email-drafts', predicate: (e) => emailDraftsFilter(e) },
  ],
});

export const MAIL_STATUS = facet({
  id: 'status',
  mode: 'or',
  multiple: true,
  options: [
    {
      id: 'unread',
      clause: (b) => ({ ef: b.eq('emailSeen', false) }),
      predicate: (e) => e.type === 'email' && !e.isRead,
    },
    {
      id: 'read',
      clause: (b) => ({ ef: b.eq('emailSeen', true) }),
      predicate: (e) => e.type === 'email' && e.isRead,
    },
    {
      id: 'not-done',
      clause: (b) => ({ ef: b.eq('emailDone', false) }),
      predicate: (e) => e.type === 'email' && !e.done,
    },
    {
      id: 'done',
      clause: (b) => ({ ef: b.eq('emailDone', true) }),
      predicate: (e) => e.type === 'email' && e.done,
    },
  ],
});

export const MAIL_ATTACHMENT = facet({
  id: 'attachment',
  mode: 'or',
  multiple: true,
  options: [
    { id: 'attachment-pdf', predicate: (e) => hasPdfAttachmentFilter(e) },
    { id: 'attachment-image', predicate: (e) => hasImageAttachmentFilter(e) },
    {
      id: 'attachment-document',
      predicate: (e) => hasDocumentAttachmentFilter(e),
    },
  ],
});

export const MAIL_CALENDAR = facet({
  id: 'calendar',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'has-calendar-invite',
      predicate: hasCalendarInviteFilter,
    },
  ],
});
