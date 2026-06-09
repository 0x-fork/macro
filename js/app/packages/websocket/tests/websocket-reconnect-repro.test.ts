import type { WebSocketServer } from 'ws';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ConstantBackoff, WebsocketBuilder, WebsocketEvent } from '../';
import type { Websocket } from '../';
import { startServer, stopClient, stopServer } from './websocket-test-utils';

/**
 * Repro for the "connected but messages don't send" bug.
 *
 * `Websocket.reconnect()` calls `close()`, which sets `_closedByUser = true`,
 * and nothing ever resets it. The new underlying socket opens fine (UI shows
 * connected), but `send()` short-circuits on `closedByUser` and silently
 * drops every message. The sync engine calls `reconnect()` whenever an update
 * ack times out (engine.ts), so one missed ack permanently zombifies the
 * connection and every subsequent edit triggers another missed ack ->
 * reconnect -> loop.
 *
 * These tests assert the CORRECT behavior and are marked `.fails` because the
 * bug is currently present. When the bug is fixed they will start passing —
 * remove `.fails` and keep them as regression tests.
 */
describe('reconnect() should produce a usable connection', () => {
  const port = 42421;
  const url = `ws://localhost:${port}`;

  let server: WebSocketServer | undefined;
  let client: Websocket | undefined;

  beforeEach(async () => {
    server = await startServer(port, 5000);
  });

  afterEach(async () => {
    await stopClient(client, 5000);
    await stopServer(server, 5000);
    client = undefined;
    server = undefined;
  });

  test.fails(
    'send() works again after a manual reconnect()',
    async () => {
      const received: string[] = [];
      server!.on('connection', (ws) => {
        ws.on('message', (data) => received.push(data.toString()));
      });

      client = new WebsocketBuilder(url)
        .withBackoff(new ConstantBackoff(100))
        .build();

      await new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.Open, () => resolve(), {
          once: true,
        })
      );

      expect(client.send('before-reconnect')).toBe(true);

      // what engine.ts does on a missed ack
      client.reconnect();

      await new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.Open, () => resolve(), {
          once: true,
        })
      );

      expect(client.underlyingWebsocket.readyState).toBe(WebSocket.OPEN);

      // CORRECT behavior: a reconnected socket must be able to send.
      // CURRENT behavior: send() returns false (closedByUser is stuck true)
      // and the server never receives the message.
      const sent = client.send('after-reconnect');
      await new Promise((r) => setTimeout(r, 250));

      expect(sent).toBe(true);
      expect(received).toContain('after-reconnect');
      expect(client.closedByUser).toBe(false);
    },
    10_000
  );
});
