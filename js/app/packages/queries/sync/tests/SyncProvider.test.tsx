import { beforeEach, describe, expect, it, vi } from 'vitest';

type TestWebsocketMessage = { type: string; data: unknown };

const mocks = vi.hoisted(() => ({
  applyNotificationStatusUpdate: vi.fn(),
  handleCommsAttachment: vi.fn(),
  handleCommsMessage: vi.fn(),
  handleCommsReaction: vi.fn(),
  handleCommsTyping: vi.fn(),
  invalidateContacts: vi.fn(),
  websocketCallbacks: [] as Array<(data: TestWebsocketMessage) => void>,
}));

vi.mock('@service-connection/websocket', () => ({
  createConnectionWebsocketEffect: vi.fn(
    (callback: (data: TestWebsocketMessage) => void) => {
      mocks.websocketCallbacks.push(callback);
    }
  ),
}));

vi.mock('@queries/agent-schedule/sync', () => ({}));

vi.mock('@queries/channel/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@queries/channel/sync')>();
  return {
    ...actual,
    handleCommsAttachment: mocks.handleCommsAttachment,
    handleCommsMessage: mocks.handleCommsMessage,
    handleCommsReaction: mocks.handleCommsReaction,
  };
});

vi.mock('@queries/channel/typing', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@queries/channel/typing')>();
  return {
    ...actual,
    handleCommsTyping: mocks.handleCommsTyping,
  };
});

vi.mock('@queries/contacts/contacts', () => ({
  invalidateContacts: mocks.invalidateContacts,
}));

vi.mock('@queries/notification/user-notifications', async () => {
  const { z } = await import('zod');
  return {
    applyNotificationStatusUpdate: mocks.applyNotificationStatusUpdate,
    notificationStatusUpdateSchema: z.object({
      type: z.literal('notification_status_updated'),
      updates: z.array(z.unknown()),
    }),
  };
});

import { QuerySyncProvider } from '../SyncProvider';

function registerSyncProvider() {
  QuerySyncProvider({ userId: () => 'current-user', children: undefined });
  const callback = mocks.websocketCallbacks.at(-1);
  if (!callback) throw new Error('websocket callback was not registered');
  return callback;
}

describe('QuerySyncProvider websocket payload parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.websocketCallbacks.length = 0;
  });

  it('parses JSON-encoded comms message payloads before handling them', () => {
    const callback = registerSyncProvider();
    const payload = {
      channel_id: 'channel-1',
      content: 'hello',
      created_at: '2024-01-01T00:00:00.000Z',
      id: 'message-1',
      nonce: 'external-message',
      sender_id: 'user-1',
      updated_at: '2024-01-01T00:00:00.000Z',
    };

    callback({ type: 'comms_message', data: JSON.stringify(payload) });

    expect(mocks.handleCommsMessage).toHaveBeenCalledWith(payload);
  });

  it('does not handle malformed comms message payloads', () => {
    const callback = registerSyncProvider();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    callback({
      type: 'comms_message',
      data: JSON.stringify({ channel_id: 'channel-1' }),
    });

    expect(mocks.handleCommsMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Malformed comms_message websocket payload',
      expect.any(Object)
    );

    warn.mockRestore();
  });
});
