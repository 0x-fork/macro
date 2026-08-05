import type { EntityData } from '@entity';
import { describe, expect, it, vi } from 'vitest';

// predicates.ts transitively imports the websocket client modules, which open
// real sockets at module scope and reject under jsdom.
vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));

import { searchSupportedFilter } from './predicates';

const entity = (
  type: string,
  extra: Record<string, unknown> = {}
): EntityData => ({ type, id: `${type}-1`, ...extra }) as unknown as EntityData;

describe('searchSupportedFilter', () => {
  // The search preset NIL-excludes channel threads server-side, so a thread row
  // reaching the feed is always stale cache — another view's rows held as
  // placeholder data, or a websocket insert. They render as an unnamed row with
  // the fallback icon until the real results land.
  it('rejects channel threads', () => {
    expect(
      searchSupportedFilter(
        entity('channel_thread', {
          channelId: 'channel-1',
          threadId: 'root-msg',
        })
      )
    ).toBe(false);
  });

  it('rejects foreign entities and CRM rows', () => {
    expect(searchSupportedFilter(entity('foreign'))).toBe(false);
    expect(searchSupportedFilter(entity('crm_company'))).toBe(false);
    expect(searchSupportedFilter(entity('crm_contact'))).toBe(false);
  });

  // Searching a message that lives in a thread does return a hit, but the
  // search service maps it to `channel_message` carrying a `threadId` — never
  // to `channel_thread`, which is a whole-thread soup row (root message,
  // reply count, preview) with no equivalent in the search response.
  it('keeps the channel rows search does return, thread replies included', () => {
    expect(searchSupportedFilter(entity('channel'))).toBe(true);
    expect(
      searchSupportedFilter(
        entity('channel_message', {
          channelId: 'channel-1',
          messageId: 'msg-1',
        })
      )
    ).toBe(true);
    expect(
      searchSupportedFilter(
        entity('channel_message', {
          channelId: 'channel-1',
          messageId: 'reply-1',
          threadId: 'root-msg',
          target: { messageId: 'reply-1', threadId: 'root-msg' },
        })
      )
    ).toBe(true);
  });

  it('keeps every other searchable entity type', () => {
    for (const type of ['document', 'email', 'chat', 'project', 'call']) {
      expect(searchSupportedFilter(entity(type))).toBe(true);
    }
  });
});
