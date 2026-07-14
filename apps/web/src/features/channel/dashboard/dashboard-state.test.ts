import { describe, expect, it } from 'vitest';
import { rankDashboardChannels } from './dashboard-state';

const channel = (id: string, activityAt?: string) => ({
  id,
  activityAt: activityAt ?? null,
});

describe('rankDashboardChannels', () => {
  it('puts unread channels before read ones, then sorts by recency', () => {
    const result = rankDashboardChannels({
      channels: [
        channel('read-new', '2026-07-14T12:00:00Z'),
        channel('unread-old', '2026-07-01T12:00:00Z'),
        channel('read-old', '2026-07-02T12:00:00Z'),
        channel('unread-new', '2026-07-13T12:00:00Z'),
      ],
      unreadCounts: new Map([
        ['unread-old', 2],
        ['unread-new', 1],
      ]),
      pinnedIds: [],
      limit: 6,
    });

    expect(result).toEqual([
      'unread-new',
      'unread-old',
      'read-new',
      'read-old',
    ]);
  });

  it('keeps pinned channels first in pinned order and fills the rest', () => {
    const result = rankDashboardChannels({
      channels: [
        channel('a', '2026-07-14T12:00:00Z'),
        channel('b', '2026-07-13T12:00:00Z'),
        channel('c', '2026-07-12T12:00:00Z'),
        channel('d', '2026-07-11T12:00:00Z'),
      ],
      unreadCounts: new Map([['d', 3]]),
      pinnedIds: ['c', 'a'],
      limit: 3,
    });

    expect(result).toEqual(['c', 'a', 'd']);
  });

  it('ignores pinned ids for channels that no longer exist', () => {
    const result = rankDashboardChannels({
      channels: [channel('a')],
      unreadCounts: new Map(),
      pinnedIds: ['gone', 'a'],
      limit: 2,
    });

    expect(result).toEqual(['a']);
  });

  it('keeps every pin even when pins exceed the limit', () => {
    const result = rankDashboardChannels({
      channels: [channel('a'), channel('b'), channel('c')],
      unreadCounts: new Map(),
      pinnedIds: ['a', 'b', 'c'],
      limit: 2,
    });

    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('caps auto-filled channels at the limit', () => {
    const result = rankDashboardChannels({
      channels: [
        channel('a', '2026-07-14T12:00:00Z'),
        channel('b', '2026-07-13T12:00:00Z'),
        channel('c', '2026-07-12T12:00:00Z'),
      ],
      unreadCounts: new Map(),
      pinnedIds: [],
      limit: 2,
    });

    expect(result).toEqual(['a', 'b']);
  });

  it('treats channels without activity as oldest', () => {
    const result = rankDashboardChannels({
      channels: [
        channel('no-activity'),
        channel('recent', '2026-07-14T12:00:00Z'),
      ],
      unreadCounts: new Map(),
      pinnedIds: [],
      limit: 6,
    });

    expect(result).toEqual(['recent', 'no-activity']);
  });
});
