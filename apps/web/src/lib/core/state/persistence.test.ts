import { createEffect, createRoot, createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';
import { describe, expect, it } from 'vitest';
import { makePersistedState, type PersistenceStorage } from './persistence';

const memoryStorage = <T>(initial?: T) => {
  let value = initial;
  const storage: PersistenceStorage<T> = {
    read: () => value,
    persist: (get) => {
      createEffect(() => {
        value = get();
      });
    },
  };
  return { storage, value: () => value };
};

describe('makePersistedState', () => {
  it('restores from the first storage and persists to every storage', async () => {
    const local = memoryStorage('local');
    const history = memoryStorage('history');
    let setValue!: (value: string) => void;
    let dispose!: VoidFunction;

    createRoot((rootDispose) => {
      dispose = rootDispose;
      const state = createSignal('default');
      const persistedState = makePersistedState(state, {
        storage: [local.storage, history.storage],
      });
      expect(persistedState).toBe(state);
      const [value, set] = persistedState;
      setValue = set;
      expect(value()).toBe('local');
    });

    await Promise.resolve();
    setValue('updated');
    await Promise.resolve();
    expect(local.value()).toBe('updated');
    expect(history.value()).toBe('updated');
    dispose();
  });

  it('can prefer a later storage such as split history', () => {
    createRoot((dispose) => {
      const local = memoryStorage('local');
      const history = memoryStorage('history');
      const state = createSignal('default');
      makePersistedState(state, {
        storage: [local.storage, history.storage],
        restoreOrder: 'last',
      });

      expect(state[0]()).toBe('history');
      dispose();
    });
  });

  it('accepts a store slice through an accessor and setter', () => {
    createRoot((dispose) => {
      const persisted = memoryStorage('restored');
      const [store, setStore] = createStore({ value: 'default' });

      makePersistedState(
        [() => store.value, (value) => setStore('value', value)],
        { storage: persisted.storage }
      );

      expect(store.value).toBe('restored');
      dispose();
    });
  });
});
