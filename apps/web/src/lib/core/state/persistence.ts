import { type Accessor, createEffect, onCleanup, untrack } from 'solid-js';

export type PersistableState<T> = readonly [
  get: Accessor<T>,
  set: (value: T) => unknown,
];

type AnyPersistableState = readonly [
  get: Accessor<unknown>,
  set: (value: never) => unknown,
];

type PersistedStateValue<TState extends AnyPersistableState> =
  TState[0] extends Accessor<infer TValue> ? TValue : never;

export type PersistenceStorage<T> = {
  /** Read synchronously during setup. Returning undefined means no value. */
  read: () => T | undefined;
  /**
   * Persist the current value. Storage implementations decide whether this is
   * eager, debounced, or registered as a navigation-away captor.
   */
  persist: (get: Accessor<T>) => VoidFunction | void;
};

export type PersistedOptions<T> = {
  storage: PersistenceStorage<T> | readonly PersistenceStorage<T>[];
  /** Prefer later storages over earlier ones when more than one has a value. */
  restoreOrder?: 'first' | 'last';
};

/**
 * Like `makePersisted`, but storage-agnostic and able to write to multiple
 * storage adapters. Signals can be passed directly. Stores and custom state
 * expose the persisted slice as an accessor/setter pair.
 */
export function makePersistedState<TState extends AnyPersistableState>(
  state: TState,
  options: PersistedOptions<PersistedStateValue<TState>>
): TState {
  type TValue = PersistedStateValue<TState>;
  const storages = Array.isArray(options.storage)
    ? options.storage
    : [options.storage];
  const get = state[0] as Accessor<TValue>;
  const set = state[1] as (value: TValue) => unknown;

  const restored = untrack(() => {
    const reads = storages
      .map((storage) => storage.read())
      .filter((item): item is TValue => item !== undefined);

    if (reads.length === 0) return undefined;
    return options.restoreOrder === 'last' ? reads[reads.length - 1] : reads[0];
  });

  if (restored !== undefined) set(restored);

  for (const storage of storages) {
    const cleanup = storage.persist(get);
    if (cleanup) onCleanup(cleanup);
  }

  return state;
}

export type LocalStorageOptions<T> = {
  key: string;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
};

export const localStoragePersistence = <T>({
  key,
  serialize = JSON.stringify,
  deserialize = JSON.parse,
}: LocalStorageOptions<T>): PersistenceStorage<T> => ({
  read: () => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return undefined;
      return deserialize(raw);
    } catch {
      return undefined;
    }
  },
  persist: (get) => {
    createEffect(() => {
      try {
        const value = get();
        if (value === undefined) {
          localStorage.removeItem(key);
          return;
        }
        localStorage.setItem(key, serialize(value));
      } catch {
        // Ignore persistence failures. The reactive source remains canonical.
      }
    });
  },
});
