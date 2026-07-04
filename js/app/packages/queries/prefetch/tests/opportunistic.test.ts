import { describe, expect, it } from 'vitest';
import { channelKeys } from '../../channel/keys';
import { queryClient } from '../../client';
import { historyKeys } from '../../history/keys';
import { notificationKeys } from '../../notification/keys';
import { soupKeys } from '../../soup/keys';
import { collectPrefetchCandidates } from '../opportunistic';
import {
  fusePrefetchSources,
  type PrefetchEntityKind,
  toEpochMillis,
} from '../ranking';

const LIMITS: Record<PrefetchEntityKind, number> = {
  channel: 2,
  emailThread: 2,
  document: 2,
};

describe('fusePrefetchSources', () => {
  it('boosts entities that appear in multiple sources', () => {
    const fused = fusePrefetchSources(
      [
        {
          weight: 1,
          entries: [
            { kind: 'channel', id: 'a' },
            { kind: 'channel', id: 'b' },
          ],
        },
        {
          weight: 1,
          entries: [
            { kind: 'channel', id: 'b' },
            { kind: 'channel', id: 'c' },
          ],
        },
      ],
      { channel: 10, emailThread: 10, document: 10 }
    );

    expect(fused[0]).toMatchObject({ kind: 'channel', id: 'b' });
    expect(fused.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('applies per-kind caps while keeping global order', () => {
    const fused = fusePrefetchSources(
      [
        {
          weight: 1,
          entries: [
            { kind: 'channel', id: 'c1' },
            { kind: 'channel', id: 'c2' },
            { kind: 'channel', id: 'c3' },
            { kind: 'emailThread', id: 'e1' },
          ],
        },
      ],
      LIMITS
    );

    expect(fused.map((c) => c.id)).toEqual(['c1', 'c2', 'e1']);
  });

  it('weights sources and skips empty ids', () => {
    const fused = fusePrefetchSources(
      [
        { weight: 0.5, entries: [{ kind: 'document', id: 'weak' }] },
        {
          weight: 2,
          entries: [
            { kind: 'document', id: '' },
            { kind: 'document', id: 'strong' },
          ],
        },
      ],
      LIMITS
    );

    expect(fused.map((c) => c.id)).toEqual(['strong', 'weak']);
  });
});

describe('toEpochMillis', () => {
  it('parses ISO strings and Dates, defaulting to 0', () => {
    expect(toEpochMillis('2026-01-02T03:04:05Z')).toBe(
      Date.parse('2026-01-02T03:04:05Z')
    );
    expect(toEpochMillis(new Date(1234))).toBe(1234);
    expect(toEpochMillis(null)).toBe(0);
    expect(toEpochMillis(undefined)).toBe(0);
    expect(toEpochMillis('not-a-date')).toBe(0);
  });
});

describe('collectPrefetchCandidates', () => {
  it('ranks channels, email threads, and md documents from cached signals', () => {
    queryClient.clear();

    queryClient.setQueryData(channelKeys.listChannels.queryKey, [
      {
        id: 'chan-unread',
        frecency_score: 1,
        viewed_at: '2026-01-01T00:00:00Z',
        latest_message: { created_at: '2026-01-02T00:00:00Z' },
      },
      {
        id: 'chan-read',
        frecency_score: 100,
        viewed_at: '2026-01-03T00:00:00Z',
        latest_message: { created_at: '2026-01-02T00:00:00Z' },
      },
    ]);

    queryClient.setQueryData(
      soupKeys.astItems({ params: {}, body: {} as never }).queryKey,
      {
        pages: [
          {
            kind: 'flat',
            nextCursor: null,
            items: [
              {
                tag: 'emailThread',
                frecency_score: 9,
                data: { id: 'thread-1' },
              },
              {
                tag: 'document',
                frecency_score: 8,
                data: { id: 'doc-md', fileType: 'md' },
              },
              {
                tag: 'document',
                frecency_score: 20,
                data: { id: 'doc-pdf', fileType: 'pdf' },
              },
              {
                tag: 'channel',
                frecency_score: 7,
                data: { channel: { id: 'chan-soup' } },
              },
            ],
          },
        ],
        pageParams: [null],
      }
    );

    queryClient.setQueryData(notificationKeys.user({ limit: 20 }).queryKey, {
      pages: [
        {
          items: [
            {
              entity_type: 'email_thread',
              entity_id: 'thread-hot',
              done: false,
              viewed_at: null,
              created_at: '2026-01-05T00:00:00Z',
            },
            {
              entity_type: 'email_thread',
              entity_id: 'thread-done',
              done: true,
              viewed_at: null,
              created_at: '2026-01-05T00:00:00Z',
            },
          ],
        },
      ],
      pageParams: [{ limit: 20 }],
    });

    queryClient.setQueryData(historyKeys.list.queryKey, [
      {
        id: 'doc-history',
        type: 'document',
        fileType: 'md',
        name: 'n',
        ownerId: 'u',
        updatedAt: '2026-01-04T00:00:00Z',
      },
      {
        id: 'chat-history',
        type: 'chat',
        name: 'n',
        ownerId: 'u',
      },
    ]);

    const candidates = collectPrefetchCandidates();
    const ids = candidates.map((c) => `${c.kind}:${c.id}`);

    // Unread notification is the strongest signal.
    expect(ids[0]).toBe('emailThread:thread-hot');
    // Unread channel outranks the higher-frecency read channel.
    expect(ids.indexOf('channel:chan-unread')).toBeLessThan(
      ids.indexOf('channel:chan-read')
    );
    // Non-md documents and done notifications are excluded.
    expect(ids).not.toContain('document:doc-pdf');
    expect(ids).not.toContain('emailThread:thread-done');
    // All sources contribute.
    expect(ids).toContain('document:doc-md');
    expect(ids).toContain('document:doc-history');
    expect(ids).toContain('channel:chan-soup');

    queryClient.clear();
  });
});
