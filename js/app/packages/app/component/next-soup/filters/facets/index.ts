import { COMPANY_OWNER, COMPANY_STAGE } from './companies';
import { DOCUMENT_TYPE } from './documents';
import { ENTITY_TYPE, INBOX_FOCUS } from './inbox';
import {
  MAIL_ATTACHMENT,
  MAIL_CALENDAR,
  MAIL_DRAFTS,
  MAIL_STATUS,
} from './mail';
import { OWNERSHIP, SCOPE } from './presets';
import { PROJECT_SCOPE } from './project';
import {
  CALL_FROM,
  CALL_IN,
  CALL_STATUS,
  CHANNEL_FROM,
  CHANNEL_IN,
  EMAIL_IMPORTANCE,
  EMAIL_INBOX,
  SEARCH_TYPE,
  TAG,
  TASK_CREATED_BY,
} from './search';
import { TASK_ASSIGNEE, TASK_PRIORITY, TASK_STATUS } from './tasks';

export * from './base';
export { COMPANY_OWNER, COMPANY_STAGE } from './companies';
export { DOCUMENT_TYPE } from './documents';
export { ENTITY_TYPE, INBOX_FOCUS } from './inbox';
export {
  MAIL_ATTACHMENT,
  MAIL_CALENDAR,
  MAIL_DRAFTS,
  MAIL_STATUS,
} from './mail';
export { OWNERSHIP, SCOPE } from './presets';
export { PROJECT_SCOPE } from './project';
export {
  CALL_FROM,
  CALL_IN,
  CALL_STATUS,
  CHANNEL_FROM,
  CHANNEL_IN,
  EMAIL_IMPORTANCE,
  EMAIL_INBOX,
  SEARCH_TYPE,
  TAG,
  TASK_CREATED_BY,
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
  MAIL_DRAFTS,
  OWNERSHIP,
  SCOPE,
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
  CALL_STATUS,
  TASK_CREATED_BY,
  TAG,
  PROJECT_SCOPE,
  COMPANY_STAGE,
  COMPANY_OWNER,
] as const;

export type FacetId = (typeof ALL_FACETS)[number]['id'];
