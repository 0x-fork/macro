/**
 * @vitest-environment jsdom
 */

import { batch, createRoot, createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastCustom: vi.fn(),
  toastDismiss: vi.fn(),
}));

vi.mock('./Toast', () => ({
  toast: {
    custom: mocks.toastCustom,
    dismiss: mocks.toastDismiss,
  },
}));

import { useKeyedPersistentToasts } from './useKeyedPersistentToasts';

type Item = { id: string; label: string };

type ToastOptions = { persistent?: boolean; onDismiss?: () => void };

function toastOptionsAt(index: number): ToastOptions {
  return mocks.toastCustom.mock.calls[index]?.[1] as ToastOptions;
}

function lastToastOptions(): ToastOptions {
  return mocks.toastCustom.mock.calls.at(-1)?.[1] as ToastOptions;
}

const PERSIST_KEY = 'macro:test-prompt:dismissed';

function persistedKeys(): string[] {
  return JSON.parse(localStorage.getItem(PERSIST_KEY) ?? '[]');
}

describe('useKeyedPersistentToasts', () => {
  let nextToastId: number;

  beforeEach(() => {
    nextToastId = 1;
    mocks.toastCustom.mockImplementation(() => nextToastId++);
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mount(
    initial: Item[],
    options?: {
      persistKey?: string;
      maxVisible?: number;
      itemsLoaded?: boolean;
    }
  ) {
    let setItems!: (items: Item[]) => void;
    let setLoaded!: (loaded: boolean) => void;
    let dispose!: () => void;
    createRoot((d) => {
      dispose = d;
      const [items, set] = createSignal(initial);
      const [loaded, setLoadedSignal] = createSignal(
        options?.itemsLoaded ?? true
      );
      setItems = set;
      setLoaded = setLoadedSignal;
      useKeyedPersistentToasts<Item>({
        items,
        key: (item) => item.id,
        persistKey: options?.persistKey,
        itemsLoaded: loaded,
        maxVisible:
          options?.maxVisible === undefined
            ? undefined
            : () => options.maxVisible!,
        toast: (item, dismiss) => ({
          title: item.label,
          actions: [{ label: 'Go', onClick: dismiss }],
        }),
      });
    });
    return { setItems, setLoaded, dispose };
  }

  function titlesShown(): string[] {
    return mocks.toastCustom.mock.calls.map(
      (call) => (call[0] as { title: string }).title
    );
  }

  it('shows one persistent toast per item and no duplicates on re-run', () => {
    const { setItems, dispose } = mount([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    expect(mocks.toastCustom).toHaveBeenCalledTimes(2);
    expect(lastToastOptions().persistent).toBe(true);

    setItems([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    expect(mocks.toastCustom).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('dismisses the toast when its item leaves the set', () => {
    const { setItems, dispose } = mount([{ id: 'a', label: 'A' }]);
    setItems([]);
    expect(mocks.toastDismiss).toHaveBeenCalledWith(1);
    dispose();
  });

  it('does not re-prompt a user-dismissed key until it leaves and returns', () => {
    const item = { id: 'a', label: 'A' };
    const { setItems, dispose } = mount([item]);
    lastToastOptions().onDismiss?.();

    setItems([]);
    setItems([{ ...item }]);
    // Left the set and came back: prompts again.
    expect(mocks.toastCustom).toHaveBeenCalledTimes(2);

    lastToastOptions().onDismiss?.();
    setItems([{ ...item, label: 'A2' }]);
    // Still in the set after dismissal: stays suppressed.
    expect(mocks.toastCustom).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('suppresses re-prompting after the action-provided dismiss handle runs', () => {
    const item = { id: 'a', label: 'A' };
    const { setItems, dispose } = mount([item]);
    const config = mocks.toastCustom.mock.calls[0][0] as {
      actions: { onClick: () => void }[];
    };
    config.actions[0].onClick();
    expect(mocks.toastDismiss).toHaveBeenCalledWith(1);

    setItems([{ ...item }]);
    expect(mocks.toastCustom).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('dismisses all live toasts on owner cleanup', () => {
    const { dispose } = mount([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
    dispose();
    expect(mocks.toastDismiss).toHaveBeenCalledWith(1);
    expect(mocks.toastDismiss).toHaveBeenCalledWith(2);
  });

  it('re-prompts a returning item when its unmount lands after it left', () => {
    const item = { id: 'a', label: 'A' };
    const { setItems, dispose } = mount([item]);
    const unmount = toastOptionsAt(0).onDismiss!;

    setItems([]);
    // The toast element unmounts on its exit animation, i.e. after the item
    // has already been forgotten.
    unmount();
    setItems([{ ...item }]);

    expect(mocks.toastCustom).toHaveBeenCalledTimes(2);
    dispose();
  });

  it('does not touch storage without a persistKey', () => {
    const { dispose } = mount([{ id: 'a', label: 'A' }]);
    lastToastOptions().onDismiss?.();
    expect(localStorage.length).toBe(0);
    dispose();
  });

  describe('with persistKey', () => {
    it('remembers a close across mounts', () => {
      const item = { id: 'a', label: 'A' };
      const first = mount([item], { persistKey: PERSIST_KEY });
      lastToastOptions().onDismiss?.();
      expect(persistedKeys()).toEqual(['a']);
      first.dispose();

      const second = mount([item], { persistKey: PERSIST_KEY });
      expect(mocks.toastCustom).toHaveBeenCalledTimes(1);
      second.dispose();
    });

    it('re-prompts next mount when the action was taken instead of closed', () => {
      const item = { id: 'a', label: 'A' };
      const first = mount([item], { persistKey: PERSIST_KEY });
      const config = mocks.toastCustom.mock.calls[0][0] as {
        actions: { onClick: () => void }[];
      };
      config.actions[0].onClick();
      toastOptionsAt(0).onDismiss?.();
      expect(persistedKeys()).toEqual([]);
      first.dispose();

      // The flow may not have landed the grant — keep the prompt available.
      const second = mount([item], { persistKey: PERSIST_KEY });
      expect(mocks.toastCustom).toHaveBeenCalledTimes(2);
      second.dispose();
    });

    it('does not record a dismissal when the owner is disposed', () => {
      const item = { id: 'a', label: 'A' };
      const { dispose } = mount([item], { persistKey: PERSIST_KEY });
      dispose();
      toastOptionsAt(0).onDismiss?.();
      expect(persistedKeys()).toEqual([]);
    });

    it('forgets a stored dismissal once the item leaves the set', () => {
      const item = { id: 'a', label: 'A' };
      const { setItems, dispose } = mount([item], { persistKey: PERSIST_KEY });
      lastToastOptions().onDismiss?.();
      expect(persistedKeys()).toEqual(['a']);

      setItems([]);
      expect(persistedKeys()).toEqual([]);
      dispose();
    });

    it('keeps stored dismissals while the item set is still loading', () => {
      const item = { id: 'a', label: 'A' };
      const first = mount([item], { persistKey: PERSIST_KEY });
      lastToastOptions().onDismiss?.();
      expect(persistedKeys()).toEqual(['a']);
      first.dispose();

      // How a page load starts: query hasn't answered, so the list is empty.
      const second = mount([], {
        persistKey: PERSIST_KEY,
        itemsLoaded: false,
      });
      expect(persistedKeys()).toEqual(['a']);

      // Links land, still needing calendar — the stored "no" holds. Data and
      // success flip together, so the empty list is never seen as loaded.
      batch(() => {
        second.setItems([item]);
        second.setLoaded(true);
      });
      expect(mocks.toastCustom).toHaveBeenCalledTimes(1);
      expect(persistedKeys()).toEqual(['a']);
      second.dispose();
    });

    it('ignores malformed stored state', () => {
      localStorage.setItem(PERSIST_KEY, '{"nope":true}');
      const { dispose } = mount([{ id: 'a', label: 'A' }], {
        persistKey: PERSIST_KEY,
      });
      expect(mocks.toastCustom).toHaveBeenCalledTimes(1);
      dispose();
    });
  });

  describe('with maxVisible', () => {
    const three: Item[] = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
      { id: 'c', label: 'C' },
    ];

    it('shows only up to the cap', () => {
      const { dispose } = mount(three, { maxVisible: 1 });
      expect(titlesShown()).toEqual(['A']);
      dispose();
    });

    it('promotes the next queued item when one is closed', () => {
      const { dispose } = mount(three, { maxVisible: 1 });
      lastToastOptions().onDismiss?.();
      expect(titlesShown()).toEqual(['A', 'B']);

      lastToastOptions().onDismiss?.();
      expect(titlesShown()).toEqual(['A', 'B', 'C']);
      dispose();
    });

    it('promotes the next queued item when one takes its action', () => {
      const { dispose } = mount(three, { maxVisible: 1 });
      const config = mocks.toastCustom.mock.calls[0][0] as {
        actions: { onClick: () => void }[];
      };
      config.actions[0].onClick();
      expect(titlesShown()).toEqual(['A', 'B']);
      dispose();
    });

    it('promotes the next queued item when one leaves the set', () => {
      const { setItems, dispose } = mount(three, { maxVisible: 1 });
      setItems(three.slice(1));
      expect(titlesShown()).toEqual(['A', 'B']);
      dispose();
    });
  });
});
