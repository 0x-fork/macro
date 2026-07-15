import type { PersistenceStorage } from '@core/state/persistence';
import type { SplitPanelContextType } from './context';
import type { EntryState } from './layoutManager';

export type EntryStatePersistenceOptions<T> = {
  panel: SplitPanelContextType;
  key: string;
  read?: (state: EntryState, key: string) => T | undefined;
  write?: (value: T) => unknown;
};

/**
 * Persists through the split's navigation-away captor and restores from the
 * current history entry. Combine with other PersistenceStorage adapters when a
 * value should have both per-entry and cross-session persistence.
 */
export const entryStatePersistence = <T>({
  panel,
  key,
  read = (state, entryKey) =>
    entryKey in state ? (state[entryKey] as T) : undefined,
  write = (value) => value,
}: EntryStatePersistenceOptions<T>): PersistenceStorage<T> => ({
  read: () => {
    const blob = (panel.handle.content() as { state?: EntryState }).state;
    return blob ? read(blob, key) : undefined;
  },
  persist: (get) =>
    panel.handle.registerEntryStateCaptor(key, () => write(get())),
});
