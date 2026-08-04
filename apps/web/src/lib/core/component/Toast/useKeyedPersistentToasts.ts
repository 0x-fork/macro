import { type Accessor, createEffect, createSignal, onCleanup } from 'solid-js';
import { type CustomToastConfig, toast } from './Toast';

function readDismissed(storageKey: string): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? '[]'
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((key): key is string => typeof key === 'string');
  } catch {
    return [];
  }
}

function writeDismissed(storageKey: string, keys: Iterable<string>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify([...keys]));
  } catch {
    // Storage may be unavailable or full. In-memory dismissal still works.
  }
}

/**
 * Keep exactly one persistent toast alive per keyed item in a reactive set.
 *
 * When an item leaves the set its toast is dismissed and its dismissal is
 * forgotten, so a later reappearance prompts again. A user-dismissed key is
 * not re-prompted while the item remains in the set. All live toasts are
 * dismissed on owner cleanup.
 *
 * The factory receives a `dismiss` handle for action handlers that should
 * close the toast and suppress re-prompting for the session (e.g. after
 * kicking off a flow that will eventually remove the item from the set).
 *
 * `maxVisible` turns the set into a queue when there isn't room for all of it
 * at once, and `persistKey` carries closes across reloads — see each below.
 */
export function useKeyedPersistentToasts<T>(options: {
  items: Accessor<readonly T[]>;
  key: (item: T) => string;
  toast: (item: T, dismiss: () => void) => CustomToastConfig;
  /**
   * localStorage key under which explicit user dismissals are remembered
   * across reloads. Set it for advisory prompts, where re-asking on every load
   * is nagging and the action stays reachable elsewhere (e.g. settings). Leave
   * it unset for prompts that must keep re-surfacing until resolved, like a
   * dead inbox grant.
   *
   * Only a close counts: taking the action, or the toast being torn down for
   * us, still re-prompts next session if the item is still there.
   */
  persistKey?: string;
  /**
   * Cap on how many of these prompts are on screen at once. The rest queue up
   * and take their turn as the visible ones are answered. Reactive, so a
   * layout-dependent cap (a phone has room for one, a desktop corner for
   * several) re-flows when it changes. Unset means show them all.
   */
  maxVisible?: Accessor<number>;
  /**
   * Whether `items` currently reflects real server state rather than a query
   * that has not answered yet. Both look like an empty list from in here, and
   * treating "still loading" as "the item is gone" would forget dismissals the
   * moment the app starts. Defaults to true, which is right for a set that is
   * synchronously derived.
   */
  itemsLoaded?: Accessor<boolean>;
}): void {
  const toastIds = new Map<string, number>();
  const dismissed = new Set<string>();
  /**
   * Keys whose toast we tore down ourselves. Their `onDismiss` reports our own
   * teardown — item left the set, action taken, owner disposed — rather than a
   * user decision, so it must not be recorded as one.
   */
  const selfDismissed = new Set<string>();

  const persistKey = options.persistKey;
  const persisted = new Set(persistKey ? readDismissed(persistKey) : []);
  for (const key of persisted) dismissed.add(key);

  // Dismissals free a slot for whatever is queued behind them, but they happen
  // outside the effect and mutate plain sets. This is what re-runs it.
  const [dismissals, setDismissals] = createSignal(0);
  const onUserDismissed = () => setDismissals((count) => count + 1);

  const dismissToast = (key: string) => {
    const id = toastIds.get(key);
    if (id !== undefined) {
      selfDismissed.add(key);
      toast.dismiss(id);
      toastIds.delete(key);
    }
  };

  const forget = (key: string) => {
    dismissed.delete(key);
    if (persistKey && persisted.delete(key)) {
      writeDismissed(persistKey, persisted);
    }
  };

  createEffect(() => {
    dismissals();
    const items = options.items();
    const maxVisible = options.maxVisible?.() ?? Number.POSITIVE_INFINITY;
    const liveKeys = new Set(items.map(options.key));

    for (const key of [...toastIds.keys()]) {
      if (!liveKeys.has(key)) dismissToast(key);
    }
    if (options.itemsLoaded?.() ?? true) {
      for (const key of [...dismissed]) {
        if (!liveKeys.has(key)) forget(key);
      }
    }

    for (const item of items) {
      const key = options.key(item);
      if (toastIds.has(key) || dismissed.has(key)) continue;
      if (toastIds.size >= maxVisible) break;

      const suppress = () => {
        dismissed.add(key);
        dismissToast(key);
        onUserDismissed();
      };
      const id = toast.custom(options.toast(item, suppress), {
        persistent: true,
        onDismiss: () => {
          toastIds.delete(key);
          // Our own teardown already left `dismissed` how it wants it, and the
          // unmount can land after the item was forgotten — re-adding here
          // would strand a returning item.
          if (selfDismissed.delete(key)) return;

          dismissed.add(key);
          if (persistKey && !persisted.has(key)) {
            persisted.add(key);
            writeDismissed(persistKey, persisted);
          }
          onUserDismissed();
        },
      });
      toastIds.set(key, id);
    }
  });

  onCleanup(() => {
    for (const key of [...toastIds.keys()]) dismissToast(key);
  });
}
