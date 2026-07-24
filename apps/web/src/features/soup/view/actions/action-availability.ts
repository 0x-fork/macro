import type { ListView } from '@app/constants/list-views';

const VALID_MARK_DONE_LIST_VIEWS: `${ListView}-${string}`[] = [
  'inbox-signal',
  'inbox-noise',
  'mail-important',
  'mail-all',
  'mail-noise',
  'mail-shared',
];

export const canExecuteMarkDoneOnView = (view: ListView, tabId: string) =>
  VALID_MARK_DONE_LIST_VIEWS.includes(`${view}-${tabId}`);
