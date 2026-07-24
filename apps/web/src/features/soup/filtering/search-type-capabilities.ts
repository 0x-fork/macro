export const SEARCH_TAGGABLE_TYPES = [
  'all',
  'task',
  'document-or-file',
  'email',
  'agent',
  'folders',
  'calls',
  'doc-snippet',
] as const;

export const isSearchTaggableType = (type: string) =>
  (SEARCH_TAGGABLE_TYPES as readonly string[]).includes(type);
