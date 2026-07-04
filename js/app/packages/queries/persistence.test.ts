import { partialMatchKey } from '@tanstack/query-core';
import { QueryClient } from '@tanstack/solid-query';
import { describe, expect, it, vi } from 'vitest';
import { channelKeys } from './channel/keys';
import {
  dehydrateChannelContentQuery,
  shouldPersistChannelContentQuery,
} from './channel/message-persistence';
import {
  type PersistScope,
  readPersistedQueryData,
  setupQueryPersistence,
  trimInfiniteQueryPages,
} from './persistence';
import type {
  PerQueryPersistence,
  PersistedQueryEntry,
} from './persistence/per-query-idb';
import {
  dehydrateDocumentLoadQuery,
  shouldPersistChannelQuery,
  shouldPersistDocumentLoadQuery,
} from './persistence-scopes';
import { documentLoadKeys } from './storage/documentLoad/keys';

function createMockStore(): PerQueryPersistence & {
  entries: Map<string, PersistedQueryEntry>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  flush: ReturnType<typeof vi.fn>;
} {
  const entries = new Map<string, PersistedQueryEntry>();
  return {
    entries,
    get: vi.fn(async (hash: string) => entries.get(hash)),
    set: vi.fn((entry: PersistedQueryEntry) => {
      entries.set(entry.queryHash, entry);
    }),
    remove: vi.fn((hash: string) => {
      entries.delete(hash);
    }),
    flush: vi.fn(async () => {}),
  };
}

function createScope(
  prefix: readonly unknown[],
  store: PerQueryPersistence,
  overrides?: Partial<PersistScope>
): PersistScope {
  return {
    store,
    maxAge: { value: 7, unit: 'd' },
    buster: 'test',
    shouldPersist: (key) => partialMatchKey(key, prefix),
    ...overrides,
  };
}

describe('setupQueryPersistence', () => {
  it('allowlists persisted channel query families', () => {
    expect(shouldPersistChannelQuery(channelKeys.withID('a').queryKey)).toBe(
      false
    );
    expect(shouldPersistChannelQuery(channelKeys.listChannels.queryKey)).toBe(
      true
    );
    expect(
      shouldPersistChannelQuery(channelKeys.messages('a', null).queryKey)
    ).toBe(false);
    expect(shouldPersistChannelQuery(['channel', 'future-family', 'a'])).toBe(
      false
    );
  });

  it('allowlists persisted channel content query families', () => {
    expect(
      shouldPersistChannelContentQuery(channelKeys.messages('a', null).queryKey)
    ).toBe(true);
    expect(
      shouldPersistChannelContentQuery(
        channelKeys.threadReplies('a', 'm').queryKey
      )
    ).toBe(true);
    expect(
      shouldPersistChannelContentQuery(channelKeys.withID('a').queryKey)
    ).toBe(false);
    expect(
      shouldPersistChannelContentQuery(channelKeys.listChannels.queryKey)
    ).toBe(false);
  });

  it('allowlists persisted document load bundles', () => {
    expect(
      shouldPersistDocumentLoadQuery(documentLoadKeys.bundle('doc-1').queryKey)
    ).toBe(true);
    expect(shouldPersistDocumentLoadQuery(['channel', 'doc-1'])).toBe(false);
  });

  it('writes only the changed query on update', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store);

    setupQueryPersistence({ queryClient, scopes: [scope] });

    queryClient.setQueryData(['channel', 'a'], { value: 1 });
    queryClient.setQueryData(['channel', 'b'], { value: 2 });

    expect(store.set).toHaveBeenCalledTimes(2);
    const firstCall = store.set.mock.calls[0]![0] as PersistedQueryEntry;
    const secondCall = store.set.mock.calls[1]![0] as PersistedQueryEntry;
    expect(firstCall.queryKey).toEqual(['channel', 'a']);
    expect(firstCall.data).toEqual({ value: 1 });
    expect(secondCall.queryKey).toEqual(['channel', 'b']);
    expect(secondCall.data).toEqual({ value: 2 });
  });

  it('isolates writes to the matching scope store', () => {
    const queryClient = new QueryClient();
    const channelStore = createMockStore();
    const emailStore = createMockStore();

    setupQueryPersistence({
      queryClient,
      scopes: [
        createScope(['channel'], channelStore),
        createScope(['email', 'threadMessages'], emailStore),
      ],
    });

    queryClient.setQueryData(['channel', 'a'], { value: 'ch' });
    queryClient.setQueryData(['email', 'threadMessages', 't-1'], {
      value: 'em',
    });

    expect(channelStore.set).toHaveBeenCalledTimes(1);
    expect(emailStore.set).toHaveBeenCalledTimes(1);
    expect(
      (channelStore.set.mock.calls[0]![0] as PersistedQueryEntry).queryKey
    ).toEqual(['channel', 'a']);
    expect(
      (emailStore.set.mock.calls[0]![0] as PersistedQueryEntry).queryKey
    ).toEqual(['email', 'threadMessages', 't-1']);
  });

  it('ignores queries that match no scope', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store);

    setupQueryPersistence({ queryClient, scopes: [scope] });

    queryClient.setQueryData(['preview', 'x'], { value: 'ignored' });

    expect(store.set).not.toHaveBeenCalled();
  });

  it('persists bottom-of-conversation channel message queries, trimmed', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store, {
      shouldPersist: shouldPersistChannelContentQuery,
      dehydrate: dehydrateChannelContentQuery,
      evictOnRemoval: false,
    });
    setupQueryPersistence({ queryClient, scopes: [scope] });

    const page = (id: number, previous_cursor: string | null = null) => ({
      items: [{ id: `m-${id}` }],
      next_cursor: `next-${id}`,
      previous_cursor,
    });

    queryClient.setQueryData(channelKeys.messages('a', null).queryKey, {
      pages: [page(0), page(1), page(2), page(3)],
      pageParams: [
        null,
        { next_cursor: 'next-0' },
        { next_cursor: 'next-1' },
        { next_cursor: 'next-2' },
      ],
    });

    expect(store.set).toHaveBeenCalledTimes(1);
    const entry = store.set.mock.calls[0]![0] as PersistedQueryEntry;
    const data = entry.data as { pages: unknown[]; pageParams: unknown[] };
    expect(data.pages).toHaveLength(3);
    expect(data.pageParams).toHaveLength(3);
    expect(data.pageParams[0]).toBeNull();
  });

  it('skips persisting mid-conversation and load-around channel message slices', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store, {
      shouldPersist: shouldPersistChannelContentQuery,
      dehydrate: dehydrateChannelContentQuery,
      evictOnRemoval: false,
    });
    setupQueryPersistence({ queryClient, scopes: [scope] });

    // Load-around variant: keyed by a target message id.
    queryClient.setQueryData(channelKeys.messages('a', 'target').queryKey, {
      pages: [{ items: [], previous_cursor: null }],
      pageParams: [null],
    });
    expect(store.set).not.toHaveBeenCalled();

    // Default variant left mid-conversation (has a previous cursor).
    queryClient.setQueryData(channelKeys.messages('b', null).queryKey, {
      pages: [{ items: [], previous_cursor: 'prev' }],
      pageParams: [null],
    });
    expect(store.set).not.toHaveBeenCalled();

    // Default variant paginated upward (pageParams[0] set).
    queryClient.setQueryData(channelKeys.messages('c', null).queryKey, {
      pages: [{ items: [], previous_cursor: null }],
      pageParams: [{ previous_cursor: 'prev' }],
    });
    expect(store.set).not.toHaveBeenCalled();

    // Transient empty state must not clobber a previously good snapshot.
    queryClient.setQueryData(channelKeys.messages('d', null).queryKey, {
      pages: [],
      pageParams: [],
    });
    expect(store.set).not.toHaveBeenCalled();

    // Thread replies pass through untouched.
    queryClient.setQueryData(channelKeys.threadReplies('a', 'm').queryKey, [
      { id: 'r-1' },
    ]);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect((store.set.mock.calls[0]![0] as PersistedQueryEntry).data).toEqual([
      { id: 'r-1' },
    ]);
  });

  it('restores channel message queries from the store', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store, {
      shouldPersist: shouldPersistChannelContentQuery,
      dehydrate: dehydrateChannelContentQuery,
      evictOnRemoval: false,
    });
    const messageQueryKey = channelKeys.messages('a', null).queryKey;
    const hash = JSON.stringify(messageQueryKey);
    const restored = {
      pages: [{ items: [{ id: 'm-1' }], previous_cursor: null }],
      pageParams: [null],
    };

    store.entries.set(hash, {
      queryHash: hash,
      queryKey: messageQueryKey,
      data: restored,
      dataUpdatedAt: Date.now() - 1000,
      persistedAt: Date.now() - 1000,
      buster: 'test',
    });

    setupQueryPersistence({ queryClient, scopes: [scope] });

    void queryClient.prefetchQuery({
      queryKey: messageQueryKey,
      queryFn: () => new Promise(() => {}),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(queryClient.getQueryData(messageQueryKey)).toEqual(restored);
  });

  it('persists and restores under a normalized storage hash', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    // Normalize away the volatile last key element (e.g. a feature-flag
    // transport or live filter list) so cold-start keys hit settled entries.
    const storageHash = (key: readonly unknown[]) =>
      JSON.stringify(key.slice(0, 2));
    const scope = createScope(['soup'], store, {
      storageHash,
      evictOnRemoval: false,
    });

    setupQueryPersistence({ queryClient, scopes: [scope] });

    // Settled session persists under the normalized hash.
    queryClient.setQueryData(['soup', 'view-a', 'graphql'], { value: 'list' });
    expect(store.entries.has(JSON.stringify(['soup', 'view-a']))).toBe(true);

    // A cold start mounts the same view with a different volatile suffix.
    void queryClient.prefetchQuery({
      queryKey: ['soup', 'view-a', undefined],
      queryFn: () => new Promise(() => {}),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(queryClient.getQueryData(['soup', 'view-a', undefined])).toEqual({
      value: 'list',
    });
  });

  it('trims infinite query pages via trimInfiniteQueryPages', () => {
    const trim = trimInfiniteQueryPages(2);
    expect(
      trim(['notification'], {
        pages: [1, 2, 3],
        pageParams: ['a', 'b', 'c'],
      })
    ).toEqual({ pages: [1, 2], pageParams: ['a', 'b'] });
    expect(trim(['notification'], { pages: [1], pageParams: ['a'] })).toEqual({
      pages: [1],
      pageParams: ['a'],
    });
    expect(trim(['notification'], { value: 1 })).toEqual({ value: 1 });
  });

  it('blanks the token when persisting document load bundles', () => {
    expect(
      dehydrateDocumentLoadQuery(documentLoadKeys.bundle('d').queryKey, {
        documentMetadata: { documentId: 'd' },
        userAccessLevel: 'owner',
        token: 'secret',
      })
    ).toEqual({
      documentMetadata: { documentId: 'd' },
      userAccessLevel: 'owner',
      token: '',
    });
  });

  it('keeps persisted entries on query removal when evictOnRemoval is false', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store, { evictOnRemoval: false });

    setupQueryPersistence({ queryClient, scopes: [scope] });

    queryClient.setQueryData(['channel', 'a'], { value: 1 });
    expect(store.set).toHaveBeenCalledTimes(1);

    queryClient.removeQueries({ queryKey: ['channel', 'a'] });
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('sweeps expired and buster-mismatched entries after startup', () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      const store = createMockStore();
      const sweep = vi.fn(
        async (isValid: (e: PersistedQueryEntry) => boolean) => {
          for (const [hash, entry] of store.entries) {
            if (!isValid(entry)) store.entries.delete(hash);
          }
        }
      );
      const scope = createScope(['channel'], store, {
        store: { ...store, sweep },
        evictOnRemoval: false,
      });

      const valid: PersistedQueryEntry = {
        queryHash: 'valid',
        queryKey: ['channel', 'v'],
        data: 1,
        dataUpdatedAt: Date.now() - 1000,
        persistedAt: Date.now() - 1000,
        buster: 'test',
      };
      const expired: PersistedQueryEntry = {
        ...valid,
        queryHash: 'expired',
        dataUpdatedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
      };
      const mismatched: PersistedQueryEntry = {
        ...valid,
        queryHash: 'mismatched',
        buster: 'other',
      };
      store.entries.set(valid.queryHash, valid);
      store.entries.set(expired.queryHash, expired);
      store.entries.set(mismatched.queryHash, mismatched);

      setupQueryPersistence({ queryClient, scopes: [scope] });
      vi.advanceTimersByTime(20_000);

      expect(sweep).toHaveBeenCalledTimes(1);
      expect([...store.entries.keys()]).toEqual(['valid']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not sweep scopes that evict on removal', () => {
    vi.useFakeTimers();
    try {
      const queryClient = new QueryClient();
      const store = createMockStore();
      const sweep = vi.fn(async () => {});
      const scope = createScope(['channel'], store, {
        store: { ...store, sweep },
      });

      setupQueryPersistence({ queryClient, scopes: [scope] });
      vi.advanceTimersByTime(20_000);

      expect(sweep).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads persisted data imperatively via readPersistedQueryData', async () => {
    const store = createMockStore();
    const scope = createScope(['documentLoad'], store);
    const queryKey = documentLoadKeys.bundle('doc-1').queryKey;
    const hash = JSON.stringify(queryKey);

    store.entries.set(hash, {
      queryHash: hash,
      queryKey,
      data: { token: '' },
      dataUpdatedAt: Date.now() - 1000,
      persistedAt: Date.now() - 1000,
      buster: 'test',
    });

    await expect(readPersistedQueryData([scope], queryKey)).resolves.toEqual({
      token: '',
    });
    await expect(
      readPersistedQueryData([scope], ['unmatched', 'key'])
    ).resolves.toBeUndefined();
  });

  it('drops expired entries in readPersistedQueryData', async () => {
    const store = createMockStore();
    const scope = createScope(['documentLoad'], store, {
      maxAge: { value: 1000, unit: 'ms' },
    });
    const queryKey = documentLoadKeys.bundle('doc-1').queryKey;
    const hash = JSON.stringify(queryKey);

    store.entries.set(hash, {
      queryHash: hash,
      queryKey,
      data: { token: '' },
      dataUpdatedAt: Date.now() - 2000,
      persistedAt: Date.now() - 2000,
      buster: 'test',
    });

    await expect(
      readPersistedQueryData([scope], queryKey)
    ).resolves.toBeUndefined();
    expect(store.remove).toHaveBeenCalledWith(hash);
  });

  it('restores query data from store on added event', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();

    store.entries.set('["channel","a"]', {
      queryHash: '["channel","a"]',
      queryKey: ['channel', 'a'],
      data: { value: 'from-idb' },
      dataUpdatedAt: Date.now() - 1000,
      persistedAt: Date.now() - 1000,
      buster: 'test',
    });

    const scope = createScope(['channel'], store);
    setupQueryPersistence({ queryClient, scopes: [scope] });

    // Trigger an 'added' event by fetching (prefetchQuery triggers added)
    void queryClient.prefetchQuery({
      queryKey: ['channel', 'a'],
      queryFn: () => new Promise(() => {}), // never resolves
    });

    // Let the IDB read promise resolve
    await Promise.resolve();
    await Promise.resolve();

    expect(queryClient.getQueryData(['channel', 'a'])).toEqual({
      value: 'from-idb',
    });
  });

  it('does not overwrite fresh fetch data with stale IDB read (race guard)', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();

    let resolveGet!: (value: PersistedQueryEntry | undefined) => void;
    store.get = vi.fn(
      () =>
        new Promise<PersistedQueryEntry | undefined>((resolve) => {
          resolveGet = resolve;
        })
    );

    const scope = createScope(['channel'], store);
    setupQueryPersistence({ queryClient, scopes: [scope] });

    // Trigger added event
    void queryClient.prefetchQuery({
      queryKey: ['channel', 'a'],
      queryFn: () => new Promise(() => {}),
    });

    await Promise.resolve();

    // Simulate fetch completing before IDB read resolves
    queryClient.setQueryData(['channel', 'a'], { value: 'fresh' });

    // Now resolve the IDB read with stale data
    resolveGet({
      queryHash: '["channel","a"]',
      queryKey: ['channel', 'a'],
      data: { value: 'stale-idb' },
      dataUpdatedAt: Date.now() - 60000,
      persistedAt: Date.now() - 60000,
      buster: 'test',
    });

    await Promise.resolve();
    await Promise.resolve();

    // Fresh data should not be overwritten
    expect(queryClient.getQueryData(['channel', 'a'])).toEqual({
      value: 'fresh',
    });
  });

  it('removes expired entries instead of restoring', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const maxAgeMs = 1000;

    store.entries.set('["channel","old"]', {
      queryHash: '["channel","old"]',
      queryKey: ['channel', 'old'],
      data: { value: 'expired' },
      dataUpdatedAt: Date.now() - maxAgeMs - 1,
      persistedAt: Date.now() - maxAgeMs - 1,
      buster: 'test',
    });

    const scope = createScope(['channel'], store, {
      maxAge: { value: maxAgeMs, unit: 'ms' },
    });
    setupQueryPersistence({ queryClient, scopes: [scope] });

    void queryClient.prefetchQuery({
      queryKey: ['channel', 'old'],
      queryFn: () => new Promise(() => {}),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(queryClient.getQueryData(['channel', 'old'])).toBeUndefined();
    expect(store.remove).toHaveBeenCalledWith('["channel","old"]');
  });

  it('removes buster-mismatched entries instead of restoring', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();

    store.entries.set('["channel","v"]', {
      queryHash: '["channel","v"]',
      queryKey: ['channel', 'v'],
      data: { value: 'old-version' },
      dataUpdatedAt: Date.now() - 1000,
      persistedAt: Date.now() - 1000,
      buster: 'old-buster',
    });

    const scope = createScope(['channel'], store, { buster: 'new-buster' });
    setupQueryPersistence({ queryClient, scopes: [scope] });

    void queryClient.prefetchQuery({
      queryKey: ['channel', 'v'],
      queryFn: () => new Promise(() => {}),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(queryClient.getQueryData(['channel', 'v'])).toBeUndefined();
    expect(store.remove).toHaveBeenCalledWith('["channel","v"]');
  });

  it('stops persistence on unsubscribe', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store);

    const unsubscribe = setupQueryPersistence({
      queryClient,
      scopes: [scope],
    });

    queryClient.setQueryData(['channel', 'a'], { value: 1 });
    expect(store.set).toHaveBeenCalledTimes(1);

    unsubscribe();

    queryClient.setQueryData(['channel', 'b'], { value: 2 });
    expect(store.set).toHaveBeenCalledTimes(1);
  });

  it('removes entry from store on query removal', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store);

    setupQueryPersistence({ queryClient, scopes: [scope] });

    queryClient.setQueryData(['channel', 'a'], { value: 1 });
    expect(store.set).toHaveBeenCalledTimes(1);

    queryClient.removeQueries({ queryKey: ['channel', 'a'] });
    expect(store.remove).toHaveBeenCalledWith('["channel","a"]');
  });
});
