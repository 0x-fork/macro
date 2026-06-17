import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrackEntityMessage } from './generated/schemas/trackEntityMessage';

// `useReopenTrackedEntitiesOnReconnect` registers a reconnect handler and sends over a
// module-level websocket singleton. Capture both via hoisted mocks so we can drive a
// reconnect and assert on what gets re-sent.
const { sendSpy, reconnectHolder, clearStreamSpy } = vi.hoisted(() => ({
  sendSpy: vi.fn(),
  reconnectHolder: { cb: undefined as undefined | (() => void) },
  clearStreamSpy: vi.fn(),
}));

vi.mock('@websocket/index', () => ({
  createReconnectEffect: (_ws: unknown, cb: () => void) => {
    reconnectHolder.cb = cb;
  },
}));

vi.mock('./websocket', () => ({
  ws: { send: sendSpy },
}));

vi.mock('./stream', () => ({
  clearStream: clearStreamSpy,
}));

function track(
  entity_id: string,
  action: TrackEntityMessage['action'],
  entity_type: TrackEntityMessage['entity_type'] = 'chat'
): TrackEntityMessage {
  return { entity_id, entity_type, action };
}

async function loadClient() {
  const mod = await import('./client');
  // Register the reconnect handler the way the app does (via the owner-scoped hook),
  // capturing its callback through the mocked createReconnectEffect.
  mod.useReopenTrackedEntitiesOnReconnect();
  return mod.connectionGatewayClient;
}

describe('connectionGatewayClient reconnect replay', () => {
  beforeEach(() => {
    // client.ts holds module-level tracking state; reset it for each test.
    vi.resetModules();
    sendSpy.mockClear();
    clearStreamSpy.mockClear();
    reconnectHolder.cb = undefined;
  });

  it('registers a reconnect handler when the hook is invoked', async () => {
    const mod = await import('./client');
    expect(reconnectHolder.cb).toBeUndefined();
    mod.useReopenTrackedEntitiesOnReconnect();
    expect(reconnectHolder.cb).toBeTypeOf('function');
  });

  it('re-sends open for every tracked entity on reconnect', async () => {
    const client = await loadClient();
    await client.trackEntity(track('chat-1', 'open', 'chat'));
    await client.trackEntity(track('doc-1', 'open', 'document'));
    sendSpy.mockClear(); // drop the initial opens; only inspect the replay

    reconnectHolder.cb?.();

    expect(sendSpy).toHaveBeenCalledTimes(2);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'track_entity',
      entity_id: 'chat-1',
      entity_type: 'chat',
      action: 'open',
    });
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'track_entity',
      entity_id: 'doc-1',
      entity_type: 'document',
      action: 'open',
    });
  });

  it('does not replay an entity once it is fully closed', async () => {
    const client = await loadClient();
    await client.trackEntity(track('chat-1', 'open'));
    await client.trackEntity(track('chat-1', 'close'));
    sendSpy.mockClear();

    reconnectHolder.cb?.();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('replays a ref-counted entity once while it is still open elsewhere', async () => {
    const client = await loadClient();
    await client.trackEntity(track('chat-1', 'open')); // count 1
    await client.trackEntity(track('chat-1', 'open')); // count 2 (second block instance)
    await client.trackEntity(track('chat-1', 'close')); // count 1 (still open)
    sendSpy.mockClear();

    reconnectHolder.cb?.();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith({
      type: 'track_entity',
      entity_id: 'chat-1',
      entity_type: 'chat',
      action: 'open',
    });
  });
});
