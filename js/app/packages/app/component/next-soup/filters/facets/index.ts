// Facet configs, exported individually. Composing them into per-view or
// per-search-type lists is a consumer concern (the soup view), not config.
import { DOCUMENT_TYPE } from './documents';
import { ENTITY_TYPE, INBOX_FOCUS } from './inbox';
import { MAIL_ATTACHMENT, MAIL_CALENDAR, MAIL_STATUS } from './mail';
import {
  CALL_FROM,
  CALL_IN,
  CHANNEL_FROM,
  CHANNEL_IN,
  EMAIL_IMPORTANCE,
  EMAIL_INBOX,
  SEARCH_TYPE,
} from './search';
import { TASK_ASSIGNEE, TASK_PRIORITY, TASK_STATUS } from './tasks';

export * from './base';
export { DOCUMENT_TYPE } from './documents';
export { ENTITY_TYPE, INBOX_FOCUS } from './inbox';
export { MAIL_ATTACHMENT, MAIL_CALENDAR, MAIL_STATUS } from './mail';
export {
  CALL_FROM,
  CALL_IN,
  CHANNEL_FROM,
  CHANNEL_IN,
  EMAIL_IMPORTANCE,
  EMAIL_INBOX,
  SEARCH_TYPE,
} from './search';
export { TASK_ASSIGNEE, TASK_PRIORITY, TASK_STATUS } from './tasks';

// Catalog for the soup view's single store; menus/search reference these by id.
export const ALL_FACETS = [
  ENTITY_TYPE,
  INBOX_FOCUS,
  DOCUMENT_TYPE,
  MAIL_STATUS,
  MAIL_CALENDAR,
  MAIL_ATTACHMENT,
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_ASSIGNEE,
  SEARCH_TYPE,
  EMAIL_IMPORTANCE,
  EMAIL_INBOX,
  CHANNEL_IN,
  CHANNEL_FROM,
  CALL_IN,
  CALL_FROM,
] as const;

export type FacetId = (typeof ALL_FACETS)[number]['id'];
