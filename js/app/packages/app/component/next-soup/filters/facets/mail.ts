// Mail facets. Attachment-by-type filtering has no ef field today (it was a
// client predicate) — omitted until the backend exposes one (see HANDOFF).
import { facet } from './base';

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

export const MAIL_CALENDAR = facet({
  id: 'calendar',
  mode: 'or',
  multiple: false,
  options: [
    {
      id: 'has-calendar-invite',
      clause: (b) => ({ ef: b.eq('emailCalendarOnly', true) }),
    },
  ],
});
