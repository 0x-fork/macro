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

const makeChannel = (id: string, name: string): MockSoupItem => ({
  tag: 'channel',
  data: {
    channel: { id, name, channel_type: 'group' },
    participants: [],
  },
  frecency_score: 0.8,
});

// ---------------------------------------------------------------------------
// getNormalizationObjectKey — same logic used in production (cache.ts)
// ---------------------------------------------------------------------------

const getNormalizationObjectKey = (
  obj: Record<string, unknown>
): string | undefined => {
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

describe('soup normalization — getNormalizationObjectKey', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it('propagates updates across queries with shared entities', () => {
    const { queryClient, normalizer } = setup();
    cleanup = () => normalizer.unsubscribe();

    const sharedDoc = makeDocument('doc-shared', 'Original Name');

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

    normalizer.setNormalizedData({
      tag: 'document',
      data: { id: 'doc-shared', name: 'Updated Name', fileType: 'md' },
      frecency_score: 1,
    });

    const docsData = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'docs' }]);
    const allData = queryClient.getQueryData<{
      pages: MockSoupPage[];
    }>(['soup', 'items', { filter: 'all' }]);

    expect(docsData!.pages[0].items[0].data.name).toBe('Updated Name');
    expect(allData!.pages[0].items[0].data.name).toBe('Updated Name');
  });

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
