import type { Accessor } from 'solid-js';
import { onCleanup, untrack } from 'solid-js';
import { reconcile, type SetStoreFunction, type Store } from 'solid-js/store';

type AccessorState = readonly [
  get: Accessor<any>,
  set: (...args: any[]) => any,
];
type StoreState = readonly [get: Store<any>, set: SetStoreFunction<any>];
type AnyPersistableState = AccessorState | StoreState;

type PersistedStateValue<TState extends AnyPersistableState> =
  TState[0] extends Accessor<infer TValue>
    ? TValue
    : TState[0] extends Store<infer TValue>
      ? TValue
      : never;

export type PersistedState<TState extends AnyPersistableState> = readonly [
  get: TState[0],
  set: TState[1],
  restored: PersistedStateValue<TState> | undefined,
];

export type PersistenceStorage<T> = {
  /** Merge this storage's value onto the state restored so far. */
  restore: (current: T) => T | undefined;
  /** Persist the storage-owned projection of one canonical value. */
  write: (value: T) => unknown;
  /** Seed deferred storage without performing an external write. */
  initialize?: (value: T) => void;
  /** Release storage-owned listeners or captors. */
  dispose?: () => void;
};

export type PersistedOptions<T> = {
  /** Storages restore in array order, so later storages take precedence. */
  storage: PersistenceStorage<T> | readonly PersistenceStorage<T>[];
};

/**
 * Setter-driven persistence for Solid signals, stores, and accessor/setter
 * state pairs. Storages restore sequentially and the returned setter writes the
 * resulting canonical state to every configured storage.
 */
export function makePersistedState<TState extends AnyPersistableState>(
  state: TState,
  options: PersistedOptions<PersistedStateValue<TState>>
): PersistedState<TState> {
  type TValue = PersistedStateValue<TState>;
  const storages = (
    Array.isArray(options.storage) ? options.storage : [options.storage]
  ) as readonly PersistenceStorage<TValue>[];
  const isAccessorState = typeof state[0] === 'function';
  const get = (isAccessorState ? state[0] : () => state[0]) as Accessor<TValue>;
  const set = state[1] as (...args: any[]) => any;
  let restored = untrack(get);
  let didRestore = false;

  for (const storage of storages) {
    try {
      const next = storage.restore(restored);
      if (next === undefined) continue;
      restored = next;
      didRestore = true;
    } catch {
      // One unavailable storage should not prevent other restores.
    }
  }

  if (didRestore) {
    if (isAccessorState) {
      // Wrapping avoids treating a function-valued state as a setter callback.
      set(() => restored);
    } else {
      set(reconcile(restored));
    }
  }

  const current = untrack(get);
  for (const storage of storages) {
    try {
      storage.initialize?.(current);
    } catch {
      // Initialization is best effort, matching storage restores and writes.
    }
    if (storage.dispose) onCleanup(storage.dispose);
  }

  const persistCurrent = () => {
    const value = untrack(get);
    for (const storage of storages) {
      try {
        storage.write(value);
      } catch {
        // One failed write should not prevent the remaining storages.
      }
    }
  };

  const persistedSetter = isAccessorState
    ? (...args: any[]) => {
        const result = set(...args);
        persistCurrent();
        return result;
      }
    : (...args: any[]) => {
        set(...args);
        persistCurrent();
      };

  return [
    state[0],
    persistedSetter as TState[1],
    didRestore ? restored : undefined,
  ];
}

export type LocalStorageOptions<T> = {
  key: string;
  serialize?: (value: T) => string;
  deserialize?: (value: string, current: T) => T;
};

export const localStoragePersistence = <T>({
  key,
  serialize = JSON.stringify,
  deserialize = (value) => JSON.parse(value) as T,
}: LocalStorageOptions<T>): PersistenceStorage<T> => ({
  restore: (current) => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      return deserialize(raw, current);
    } catch {
      return undefined;
    }
  },
  write: (value) => {
    try {
      if (value === undefined) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, serialize(value));
    } catch {
      // The reactive source remains canonical when storage is unavailable.
    }
  },
});
