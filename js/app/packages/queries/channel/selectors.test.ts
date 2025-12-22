import { describe, expect, it } from 'vitest';
import { groupChannelMessages } from './selectors';

function msg(partial: Partial<any>) {
  return {
    id: partial.id ?? 'm',
    channel_id: partial.channel_id ?? 'c1',
    content: partial.content ?? '',
    sender_id: partial.sender_id ?? 'u1',
    created_at: partial.created_at ?? '2025-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2025-01-01T00:00:00.000Z',
    thread_id: partial.thread_id,
    deleted_at: partial.deleted_at,
  };
}

describe('groupChannelMessages', () => {
  it('splits top-level vs threaded messages', () => {
    const input = [
      msg({ id: 'a' }),
      msg({ id: 'b', thread_id: 't1' }),
      msg({ id: 'c' }),
      msg({ id: 'd', thread_id: 't1' }),
      msg({ id: 'e', thread_id: 't2' }),
    ];

    const out = groupChannelMessages(input as any);

    expect(out.topLevel.map((m) => m.id)).toEqual(['a', 'c']);
    expect(Object.keys(out.threadsById).sort()).toEqual(['t1', 't2']);
    expect(out.threadsById.t1.map((m) => m.id)).toEqual(['b', 'd']);
    expect(out.threadsById.t2.map((m) => m.id)).toEqual(['e']);
  });

  it('preserves order within each thread group', () => {
    const input = [
      msg({ id: '1', thread_id: 't1' }),
      msg({ id: '2', thread_id: 't1' }),
      msg({ id: '3', thread_id: 't1' }),
    ];

    const out = groupChannelMessages(input as any);
    expect(out.threadsById.t1.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('handles empty input', () => {
    const out = groupChannelMessages([]);
    expect(out.topLevel).toEqual([]);
    expect(out.threadsById).toEqual({});
  });

  it('treats null/undefined thread_id as top-level', () => {
    const input = [
      msg({ id: 'a', thread_id: undefined }),
      msg({ id: 'b', thread_id: null }),
      msg({ id: 'c', thread_id: 't1' }),
    ];

    const out = groupChannelMessages(input as any);
    expect(out.topLevel.map((m) => m.id)).toEqual(['a', 'b']);
    expect(out.threadsById.t1.map((m) => m.id)).toEqual(['c']);
  });
});


