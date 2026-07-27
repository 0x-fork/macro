import type { ListView } from '@app/constants/list-views';

export function showSoupSort(view: ListView, isNewInbox: boolean) {
  return (
    view !== 'search' &&
    view !== 'companies' &&
    view !== 'calls' &&
    !(view === 'inbox' && isNewInbox)
  );
}
