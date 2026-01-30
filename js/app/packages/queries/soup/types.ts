import type {
  ChannelFilters,
  ChatFilters,
  DocumentFilters,
  EmailFilters,
  ProjectFilters,
} from '@service-storage/generated/schemas';

export type SoupQueryFilters = {
  /** the bundled [ChannelFilters] */
  channel_filters?: ChannelFilters;
  /** the bundled [ChatFilters] */
  chat_filters?: ChatFilters;
  /** the bundled [DocumentFilters] */
  document_filters?: DocumentFilters;
  /** the bundled [EmailFilters] */
  email_filters?: EmailFilters;
  /** the bundled [ProjectFilters] */
  project_filters?: ProjectFilters;
};
