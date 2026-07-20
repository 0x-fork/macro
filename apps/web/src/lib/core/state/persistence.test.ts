import { createRoot, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { describe, expect, it, vi } from 'vitest';
import { makePersistedState, type PersistenceStorage } from './persistence';

const memoryStorage = <T>(initial?: T) => {
  let value = initial;
  const storage: PersistenceStorage<T> = {
    restore: () => value,
    write: (next) => {
      value = next;
    },
  };
  return { storage, value: () => value };
};

describe('makePersistedState', () => {
  it('restores sequentially and writes through the wrapped setter', () => {
    createRoot((dispose) => {
      const local = memoryStorage('local');
      const history = memoryStorage('history');
      const state = createSignal('default');
      const [value, setValue, restored] = makePersistedState(state, {
        storage: [local.storage, history.storage],
      });

      expect(value).toBe(state[0]);
      expect(setValue).not.toBe(state[1]);
      expect(restored).toBe('history');
      expect(value()).toBe('history');

      setValue('updated');
      expect(local.value()).toBe('updated');
      expect(history.value()).toBe('updated');
      dispose();
    });
  });

  it('composes storage-owned fields in order', () => {
    createRoot((dispose) => {
      type State = { search: string; sort: string; tab: string };
      const preference: PersistenceStorage<State> = {
        restore: (current) => ({ ...current, sort: 'local-sort' }),
        write: vi.fn(),
      };
      const history: PersistenceStorage<State> = {
        restore: (current) => ({
          ...current,
          search: 'history-search',
          tab: 'history-tab',
        }),
        write: vi.fn(),
      };
      const [state] = makePersistedState(
        createStore<State>({
          search: 'default-search',
          sort: 'default-sort',
          tab: 'default-tab',
        }),
        { storage: [preference, history] }
      );

      expect(state).toEqual({
        search: 'history-search',
        sort: 'local-sort',
        tab: 'history-tab',
      });
      dispose();
    });
  });

  it('persists the canonical value after functional signal updates', () => {
    createRoot((dispose) => {
      const persisted = memoryStorage(1);
      const [value, setValue] = makePersistedState(createSignal(0), {
        storage: persisted.storage,
      });

      setValue((current) => current + 1);
      expect(value()).toBe(2);
      expect(persisted.value()).toBe(2);
      dispose();
    });
  });

  it('accepts a custom accessor and setter pair', () => {
    createRoot((dispose) => {
      const persisted = memoryStorage('restored');
      const [store, setStore] = createStore({ value: 'default' });
      const [value, setValue] = makePersistedState(
        [() => store.value, (next: string) => setStore('value', next)] as const,
        { storage: persisted.storage }
      );

      expect(value()).toBe('restored');
      setValue('updated');
      expect(store.value).toBe('updated');
      expect(persisted.value()).toBe('updated');
      dispose();
    });
  });

  it('supports Solid stores and their path setters', () => {
    createRoot((dispose) => {
      const persisted = memoryStorage({ count: 2, label: 'restored' });
      const state = createStore({ count: 0, label: 'default' });
      const [store, setStore, restored] = makePersistedState(state, {
        storage: persisted.storage,
      });

      expect(store).toBe(state[0]);
      expect(restored).toEqual({ count: 2, label: 'restored' });
      expect(store.count).toBe(2);
      expect(store.label).toBe('restored');

      setStore('count', 3);
      expect(store.count).toBe(3);
      expect(persisted.value()).toMatchObject({
        count: 3,
        label: 'restored',
      });
      dispose();
    });
  });

  it('initializes and disposes storage-owned capture state', () => {
    createRoot((dispose) => {
      const initialize = vi.fn();
      const storageDispose = vi.fn();
      const storage: PersistenceStorage<string> = {
        restore: () => undefined,
        write: vi.fn(),
        initialize,
        dispose: storageDispose,
      };

      makePersistedState(createSignal('default'), { storage });
      expect(initialize).toHaveBeenCalledWith('default');
      dispose();
      expect(storageDispose).toHaveBeenCalledOnce();
    });
  });
});
