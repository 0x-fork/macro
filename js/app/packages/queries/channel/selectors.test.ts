import { describe, expect, it } from 'vitest';
import type { Message } from '@service-comms/generated/models/message';
import { groupChannelMessages } from './selectors';

function msg(partial: Partial<Message> = {}): Message {
  return {
    id: partial.id ?? 'm',
    channel_id: partial.channel_id ?? 'c1',
    content: partial.content ?? '',
    sender_id: partial.sender_id ?? 'u1',
    created_at: partial.created_at ?? '2025-01-01T00:00:00.000Z',
    updated_at: partial.updated_at ?? '2025-01-01T00:00:00.000Z',
    thread_id: partial.thread_id,
    deleted_at: partial.deleted_at,
    edited_at: partial.edited_at,
  };
}

describe('groupChannelMessages', () => {
  const check = (
    input: Message[],
    expected: {
      topLevelIds: string[];
      threads: Record<string, string[]>;
    }
  ) => {
    const out = groupChannelMessages(input);
    expect(out.topLevel.map((m) => m.id)).toEqual(expected.topLevelIds);
    expect(
      Object.fromEntries(
        Object.entries(out.threadsById).map(([k, v]) => [k, v.map((m) => m.id)])
      )
    ).toEqual(expected.threads);
  };

  it('splits top-level vs threaded messages', () => {
    check(
      [
        msg({ id: 'a' }),
        msg({ id: 'b', thread_id: 't1' }),
        msg({ id: 'c' }),
        msg({ id: 'd', thread_id: 't1' }),
        msg({ id: 'e', thread_id: 't2' }),
      ],
      {
        topLevelIds: ['a', 'c'],
        threads: { t1: ['b', 'd'], t2: ['e'] },
      }
    );
  });

  it('preserves order within each thread group', () => {
    check(
      [
        msg({ id: '1', thread_id: 't1' }),
        msg({ id: '2', thread_id: 't1' }),
        msg({ id: '3', thread_id: 't1' }),
      ],
      { topLevelIds: [], threads: { t1: ['1', '2', '3'] } }
    );
  });

  it('handles empty input', () => {
    check([], { topLevelIds: [], threads: {} });
  });

  it('treats undefined thread_id as top-level', () => {
    check(
      [msg({ id: 'a', thread_id: undefined }), msg({ id: 'b', thread_id: 't1' })],
      { topLevelIds: ['a'], threads: { t1: ['b'] } }
    );
  });
});


