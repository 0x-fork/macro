import { QueryClient } from '@tanstack/solid-query';
import { createQueryNormalizer } from '@normy/query-core';
import { describe, expect, it, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers: mock SoupApiItem-shaped data
// ---------------------------------------------------------------------------

type MockSoupItem = {
  tag: string;
  data: Record<string, unknown>;
  frecency_score: number;
};

type MockSoupPage = {
  items: MockSoupItem[];
  next_cursor?: string | null;
};

const makeDocument = (
  id: string,
  name: string,
  extra?: Record<string, unknown>
): MockSoupItem => ({
  tag: 'document',
  data: { id, name, fileType: 'md', ...extra },
  frecency_score: 1,
});

const makeChat = (id: string, name: string): MockSoupItem => ({
  tag: 'chat',
  data: { id, name },
  frecency_score: 0.5,
});

const makeChannel = (
  id: string,
  name: string,
  extra?: Record<string, unknown>
): MockSoupItem => ({
  tag: 'channel',
  data: {
    channel: { id, name, channel_type: 'group', ...extra },
    participants: [],
  },
  frecency_score: 0.8,
});

// ---------------------------------------------------------------------------
// getNormalizationObjectKey — same logic we'll use in production
// ---------------------------------------------------------------------------

const getNormalizationObjectKey = (
  obj: Record<string, unknown>
): string | undefined => {
  // Only normalize SoupApiItem wrappers (have tag + data + frecency_score)
  if ('tag' in obj && 'data' in obj && 'frecency_score' in obj) {
    const data = obj.data as Record<string, unknown>;
    if (obj.tag === 'channel') {
      const channel = data?.channel as Record<string, unknown> | undefined;
      return channel?.id ? `soup:${channel.id}` : undefined;
    }
    return data?.id ? `soup:${data.id}` : undefined;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  const normalizer = createQueryNormalizer(queryClient, {
    getNormalizationObjectKey,
  });
  normalizer.subscribe();
  return { queryClient, normalizer };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normy spike — InfiniteData<SoupPage>', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  // 1. Basic infinite query normalization
  it('normalizes entities in InfiniteData<SoupPage>', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    const page: MockSoupPage = {
      items: [
        makeDocument('doc-1', 'My Doc'),
        makeChat('chat-1', 'My Chat'),
        makeChannel('chan-1', 'My Channel'),
      ],
      next_cursor: null,
    };

    queryClient.setQueryData(['soup', 'items', { filter: 'all' }], {
      pages: [page],
      pageParams: [null],
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
      pageParams: unknown[];
    }>(['soup', 'items', { filter: 'all' }]);

    expect(data).toBeDefined();
    expect(data!.pages[0].items).toHaveLength(3);
    expect(data!.pages[0].items[0].data.name).toBe('My Doc');
    expect(data!.pages[0].items[2].data).toHaveProperty('channel');
  });

  // 2. Cross-query update propagation
  it('propagates updates across queries with shared entities', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    const sharedDoc = makeDocument('doc-shared', 'Original Name');

    // Two queries with different filters but same entity
    queryClient.setQueryData(['soup', 'items', { filter: 'docs' }], {
      pages: [{ items: [sharedDoc], next_cursor: null }],
      pageParams: [null],
    });
    queryClient.setQueryData(['soup', 'items', { filter: 'all' }], {
      pages: [
        {
          items: [sharedDoc, makeChat('chat-2', 'Some Chat')],
          next_cursor: null,
        },
      ],
      pageParams: [null],
    });

    // Update the shared document via normalized data
    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'doc-shared', name: 'Updated Name', fileType: 'md' },
      frecency_score: 1,
    });

    // Both queries should reflect the update
    const docsData = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'docs' }]);
    const allData = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'all' }]);

    expect(docsData!.pages[0].items[0].data.name).toBe('Updated Name');
    expect(allData!.pages[0].items[0].data.name).toBe('Updated Name');
  });

  // 3. pageParams preservation
  it('preserves pageParams after setNormalizedData update', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    const pageParams = [null, 'cursor-1', 'cursor-2'];

    queryClient.setQueryData(['soup', 'items', { filter: 'paged' }], {
      pages: [
        { items: [makeDocument('d1', 'Doc 1')], next_cursor: 'cursor-1' },
        { items: [makeDocument('d2', 'Doc 2')], next_cursor: 'cursor-2' },
        { items: [makeDocument('d3', 'Doc 3')], next_cursor: null },
      ],
      pageParams,
    });

    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'd2', name: 'Doc 2 Updated', fileType: 'md' },
      frecency_score: 1,
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
      pageParams: unknown[];
    }>(['soup', 'items', { filter: 'paged' }]);

    expect(data!.pageParams).toEqual(pageParams);
  });

  // 4. next_cursor preservation
  it('preserves next_cursor on each page after normalize/denormalize round-trip', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    queryClient.setQueryData(['soup', 'items', { filter: 'cursored' }], {
      pages: [
        {
          items: [makeDocument('d1', 'Doc 1')],
          next_cursor: 'cursor-abc',
        },
        { items: [makeDocument('d2', 'Doc 2')], next_cursor: null },
      ],
      pageParams: [null, 'cursor-abc'],
    });

    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'd1', name: 'Doc 1 Updated', fileType: 'md' },
      frecency_score: 1,
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'cursored' }]);

    expect(data!.pages[0].next_cursor).toBe('cursor-abc');
    expect(data!.pages[1].next_cursor).toBeNull();
  });

  // 5. Channel nested ID
  it('normalizes channel entities with nested data.channel.id', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    queryClient.setQueryData(['soup', 'items', { filter: 'channels' }], {
      pages: [
        {
          items: [makeChannel('chan-1', 'General')],
          next_cursor: null,
        },
      ],
      pageParams: [null],
    });

    // Update channel name
    normalizer.setNormalizedData({
      tag: 'channel',
      data: {
        channel: {
          id: 'chan-1',
          name: 'Renamed Channel',
          channel_type: 'group',
        },
        participants: [],
      },
      frecency_score: 0.8,
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'channels' }]);

    const channelData = data!.pages[0].items[0].data as {
      channel: { id: string; name: string };
    };
    expect(channelData.channel.name).toBe('Renamed Channel');
  });

  // 6. Entity removal — normy does NOT handle removals from lists
  it('does not support entity removal (normy only handles updates)', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    queryClient.setQueryData(['soup', 'items', { filter: 'remove-test' }], {
      pages: [
        {
          items: [makeDocument('d1', 'Keep'), makeDocument('d2', 'Remove')],
          next_cursor: null,
        },
      ],
      pageParams: [null],
    });

    // Normy has no built-in removal API — we still need removeSoupEntities
    // Verify the normalizer doesn't have a remove method
    expect(normalizer).not.toHaveProperty('removeNormalizedData');

    // After any normy update, the item count stays the same
    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'd1', name: 'Keep Updated', fileType: 'md' },
      frecency_score: 1,
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'remove-test' }]);

    // Both items still present — removal must be handled manually
    expect(data!.pages[0].items).toHaveLength(2);
  });

  // 7. Multi-page infinite query — entity on page 2 updated, structure preserved
  it('updates entity on page 2 of a multi-page infinite query', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    queryClient.setQueryData(['soup', 'items', { filter: 'multi' }], {
      pages: [
        { items: [makeDocument('d1', 'Page 1 Doc')], next_cursor: 'c1' },
        { items: [makeDocument('d2', 'Page 2 Doc')], next_cursor: 'c2' },
        { items: [makeChat('c1', 'Page 3 Chat')], next_cursor: null },
      ],
      pageParams: [null, 'c1', 'c2'],
    });

    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'd2', name: 'Page 2 Doc Updated', fileType: 'md' },
      frecency_score: 1,
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
      pageParams: unknown[];
    }>(['soup', 'items', { filter: 'multi' }]);

    // Page structure preserved
    expect(data!.pages).toHaveLength(3);
    expect(data!.pageParams).toEqual([null, 'c1', 'c2']);

    // Page 1 unchanged
    expect(data!.pages[0].items[0].data.name).toBe('Page 1 Doc');
    expect(data!.pages[0].next_cursor).toBe('c1');

    // Page 2 updated
    expect(data!.pages[1].items[0].data.name).toBe('Page 2 Doc Updated');
    expect(data!.pages[1].next_cursor).toBe('c2');

    // Page 3 unchanged
    expect(data!.pages[2].items[0].data.name).toBe('Page 3 Chat');
    expect(data!.pages[2].next_cursor).toBeNull();
  });

  // 8. Insert new entity then normalize — simulates the insert path of fetchAndUpsertSoupEntity
  it('normalizes a newly inserted entity and propagates subsequent updates', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    // Start with one query containing a single document
    queryClient.setQueryData(['soup', 'items', { filter: 'all' }], {
      pages: [
        {
          items: [makeDocument('existing-1', 'Existing Doc')],
          next_cursor: null,
        },
      ],
      pageParams: [null],
    });

    // Simulate the insert path: prepend a brand-new entity to the first page
    const newDoc = makeDocument('new-1', 'New Doc');
    queryClient.setQueryData(['soup', 'items', { filter: 'all' }], {
      pages: [
        {
          items: [newDoc, makeDocument('existing-1', 'Existing Doc')],
          next_cursor: null,
        },
      ],
      pageParams: [null],
    });

    // Also seed a second query that contains the same new entity
    queryClient.setQueryData(['soup', 'items', { filter: 'docs' }], {
      pages: [
        {
          items: [makeDocument('new-1', 'New Doc')],
          next_cursor: null,
        },
      ],
      pageParams: [null],
    });

    // Now use setNormalizedData to update the newly inserted entity
    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'new-1', name: 'New Doc Updated', fileType: 'md' },
      frecency_score: 1,
    });

    // Both queries should reflect the update
    const allData = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'all' }]);
    const docsData = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'docs' }]);

    expect(allData!.pages[0].items[0].data.name).toBe('New Doc Updated');
    expect(allData!.pages[0].items[1].data.name).toBe('Existing Doc');
    expect(docsData!.pages[0].items[0].data.name).toBe('New Doc Updated');
  });

  // 9. No over-normalization — SoupProperty objects should NOT be normalized
  it('does not normalize SoupProperty objects (only SoupApiItem wrappers)', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    const docWithProperties = makeDocument('doc-props', 'Doc With Props', {
      properties: [
        {
          definition: { id: 'prop-def-1', name: 'Status' },
          value: { type: 'String', value: 'active' },
        },
        {
          definition: { id: 'prop-def-2', name: 'Priority' },
          value: { type: 'Number', value: 5 },
        },
      ],
    });

    queryClient.setQueryData(['soup', 'items', { filter: 'props' }], {
      pages: [{ items: [docWithProperties], next_cursor: null }],
      pageParams: [null],
    });

    // Update the document name — properties should be preserved as-is
    normalizer.setNormalizedData({
      tag: 'document',
      data: {
        id: 'doc-props',
        name: 'Updated Doc',
        fileType: 'md',
        properties: [
          {
            definition: { id: 'prop-def-1', name: 'Status' },
            value: { type: 'String', value: 'inactive' },
          },
          {
            definition: { id: 'prop-def-2', name: 'Priority' },
            value: { type: 'Number', value: 10 },
          },
        ],
      },
      frecency_score: 1,
    });

    const data = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'props' }]);

    const props = (data!.pages[0].items[0].data as { properties: unknown[] })
      .properties;

    // Properties should be present and updated (not stripped by normalization)
    expect(props).toHaveLength(2);
    expect(props[0]).toEqual({
      definition: { id: 'prop-def-1', name: 'Status' },
      value: { type: 'String', value: 'inactive' },
    });
    expect(props[1]).toEqual({
      definition: { id: 'prop-def-2', name: 'Priority' },
      value: { type: 'Number', value: 10 },
    });
  });
});
