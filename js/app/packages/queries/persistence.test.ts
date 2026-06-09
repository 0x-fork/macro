import { partialMatchKey } from '@tanstack/query-core';
import { QueryClient } from '@tanstack/solid-query';
import { describe, expect, it, vi } from 'vitest';
import { channelKeys } from './channel/keys';
import {
  dehydrateFirstPage,
  type PersistScope,
  setupQueryPersistence,
} from './persistence';
import type {
  PerQueryPersistence,
  PersistedQueryEntry,
} from './persistence/per-query-idb';
import {
  dehydrateLatestChannelMessagesPage,
  shouldPersistChannelMessagesQuery,
  shouldPersistChannelQuery,
} from './persistence-scopes';

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

  it('does not restore or persist channel message queries', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['channel'], store, {
      shouldPersist: shouldPersistChannelQuery,
    });
    const messageQueryKey = [
      'channel',
      'a',
      { loadAroundMessageId: null },
    ] as const;

    store.entries.set(JSON.stringify(messageQueryKey), {
      queryHash: JSON.stringify(messageQueryKey),
      queryKey: messageQueryKey,
      data: { value: 'from-idb' },
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

    expect(store.get).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(messageQueryKey)).toBeUndefined();

    queryClient.setQueryData(messageQueryKey, { value: 'skip' });
    expect(store.set).not.toHaveBeenCalled();

    queryClient.setQueryData(channelKeys.listChannels.queryKey, {
      value: 'persist',
    });
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(
      (store.set.mock.calls[0]![0] as PersistedQueryEntry).queryKey
    ).toEqual(channelKeys.listChannels.queryKey);
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

  it('persists only the first page when the scope dehydrates infinite data', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope(['soup'], store, {
      dehydrateData: dehydrateFirstPage,
    });

    setupQueryPersistence({ queryClient, scopes: [scope] });

    queryClient.setQueryData(['soup', 'list'], {
      pages: [{ items: ['a'] }, { items: ['b'] }, { items: ['c'] }],
      pageParams: [null, 'cursor-1', 'cursor-2'],
    });

    expect(store.set).toHaveBeenCalledTimes(1);
    const entry = store.set.mock.calls[0]![0] as PersistedQueryEntry;
    expect(entry.data).toEqual({
      pages: [{ items: ['a'] }],
      pageParams: [null],
    });
  });

  it('shows a restored first page immediately, then one fresh request replaces it', async () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const queryKey = ['soup', 'list'];
    const queryHash = JSON.stringify(queryKey);

    store.entries.set(queryHash, {
      queryHash,
      queryKey,
      data: { pages: [{ items: ['persisted'] }], pageParams: [null] },
      dataUpdatedAt: Date.now() - 1000,
      persistedAt: Date.now() - 1000,
      buster: 'test',
    });

    const scope = createScope(['soup'], store, {
      dehydrateData: dehydrateFirstPage,
    });
    setupQueryPersistence({ queryClient, scopes: [scope] });

    type Page = { items: string[]; next: string | null };
    let resolveFetch!: (page: Page) => void;
    const queryFn = vi.fn(
      () =>
        new Promise<Page>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const fetchPromise = queryClient.prefetchInfiniteQuery({
      queryKey,
      queryFn,
      initialPageParam: null as string | null,
      getNextPageParam: (lastPage: Page) => lastPage.next,
    });

    // Let the IDB read promise resolve while the initial fetch is in flight:
    // the persisted page is visible without waiting for the network.
    await Promise.resolve();
    await Promise.resolve();
    expect(queryClient.getQueryData(queryKey)).toEqual({
      pages: [{ items: ['persisted'] }],
      pageParams: [null],
    });

    resolveFetch({ items: ['fresh'], next: 'cursor-1' });
    await fetchPromise;

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKey)).toEqual({
      pages: [{ items: ['fresh'], next: 'cursor-1' }],
      pageParams: [null],
    });
  });
});

describe('channel messages persistence', () => {
  const bottomAnchoredData = {
    pages: [
      { items: ['newest'], next_cursor: 'c-1', previous_cursor: null },
      { items: ['older'], next_cursor: null, previous_cursor: 'c-1' },
    ],
    pageParams: [null, { next_cursor: 'c-1', previous_cursor: null }],
  };

  it('allowlists only the default messages variant', () => {
    expect(
      shouldPersistChannelMessagesQuery(
        channelKeys.messages('a', null).queryKey
      )
    ).toBe(true);
    expect(
      shouldPersistChannelMessagesQuery(
        channelKeys.messages('a', 'msg-1').queryKey
      )
    ).toBe(false);
    expect(
      shouldPersistChannelMessagesQuery(
        channelKeys.messagesByIds('a', ['msg-1']).queryKey
      )
    ).toBe(false);
    expect(
      shouldPersistChannelMessagesQuery(channelKeys.listChannels.queryKey)
    ).toBe(false);
  });

  it('dehydrates bottom-anchored data to the newest page', () => {
    expect(dehydrateLatestChannelMessagesPage(bottomAnchoredData)).toEqual({
      pages: [{ items: ['newest'], next_cursor: 'c-1', previous_cursor: null }],
      pageParams: [null],
    });
  });

  it('skips mid-conversation data instead of persisting it', () => {
    expect(
      dehydrateLatestChannelMessagesPage({
        pages: [{ items: ['mid'], next_cursor: 'c-2', previous_cursor: null }],
        pageParams: [{ next_cursor: null, previous_cursor: 'c-9' }],
      })
    ).toBeUndefined();
    expect(
      dehydrateLatestChannelMessagesPage({
        pages: [{ items: ['mid'], next_cursor: 'c-2', previous_cursor: 'c-3' }],
        pageParams: [null],
      })
    ).toBeUndefined();
    expect(dehydrateLatestChannelMessagesPage({ value: 1 })).toBeUndefined();
  });

  it('does not overwrite the stored entry when dehydrateData skips', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope([], store, {
      shouldPersist: shouldPersistChannelMessagesQuery,
      dehydrateData: dehydrateLatestChannelMessagesPage,
    });

    setupQueryPersistence({ queryClient, scopes: [scope] });

    queryClient.setQueryData(channelKeys.messages('a', null).queryKey, {
      pages: [{ items: ['mid'], next_cursor: null, previous_cursor: 'c-1' }],
      pageParams: [null],
    });

    expect(store.set).not.toHaveBeenCalled();
  });

  it('retains the persisted entry when the query is removed', () => {
    const queryClient = new QueryClient();
    const store = createMockStore();
    const scope = createScope([], store, {
      shouldPersist: shouldPersistChannelMessagesQuery,
      dehydrateData: dehydrateLatestChannelMessagesPage,
      retainOnRemoval: true,
    });

    setupQueryPersistence({ queryClient, scopes: [scope] });

    const queryKey = channelKeys.messages('a', null).queryKey;
    queryClient.setQueryData(queryKey, bottomAnchoredData);
    expect(store.set).toHaveBeenCalledTimes(1);

    queryClient.removeQueries({ queryKey });
    expect(store.remove).not.toHaveBeenCalled();
    expect(store.entries.size).toBe(1);
  });
});

describe('dehydrateFirstPage', () => {
  it('slices infinite data to the first page and page param', () => {
    expect(
      dehydrateFirstPage({
        pages: [{ items: [1] }, { items: [2] }],
        pageParams: [null, 'cursor-1'],
      })
    ).toEqual({ pages: [{ items: [1] }], pageParams: [null] });
  });

  it('passes single-page infinite data through unchanged', () => {
    const data = { pages: [{ items: [1] }], pageParams: [null] };
    expect(dehydrateFirstPage(data)).toBe(data);
  });

  it('passes non-infinite data through unchanged', () => {
    const data = { value: 1, pages: 'not-an-array' };
    expect(dehydrateFirstPage(data)).toBe(data);
    expect(dehydrateFirstPage(null)).toBe(null);
    expect(dehydrateFirstPage([1, 2])).toEqual([1, 2]);
  });
});
