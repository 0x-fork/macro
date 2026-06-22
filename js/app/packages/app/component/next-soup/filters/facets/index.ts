// Facet configs, exported individually. Composing them into per-view or
// per-search-type lists is a consumer concern (the soup view), not config.
export * from './base';
export { ENTITY_TYPE } from './inbox';
export { DOCUMENT_TYPE } from './documents';
export { MAIL_CALENDAR, MAIL_STATUS } from './mail';
export { TASK_ASSIGNEE, TASK_PRIORITY, TASK_STATUS } from './tasks';
export {
  CALL_FROM,
  CALL_IN,
  CHANNEL_FROM,
  CHANNEL_IN,
  EMAIL_IMPORTANCE,
  EMAIL_INBOX,
  SEARCH_TYPE,
} from './search';
