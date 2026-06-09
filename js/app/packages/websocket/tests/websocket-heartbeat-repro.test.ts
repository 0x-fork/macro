import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  ConstantBackoff,
  type Websocket,
  WebsocketBuilder,
  WebsocketEvent,
} from '../';
import {
  startServerWithHeartbeat,
  stopClient,
  stopServer,
  type WebsocketServerWithHeartbeat,
} from './websocket-test-utils';

/**
 * Repro for intermittent disconnects on long-lived, otherwise-healthy
 * connections.
 *
 * `missedHeartbeats` is incremented in handleHeartbeatTimeout() but is never
 * reset when a pong IS received (handleHeartbeatReceived() only clears the
 * timeout). It is only reset on startHeartbeat()/stopHeartbeat(). So the
 * counter accumulates over the lifetime of a connection: with
 * maxMissedHeartbeats = 2 (the sync-service config), the 3rd missed pong —
 * even with hours of healthy ping/pong in between — force-closes a healthy
 * connection ("No heartbeat received").
 *
 * This test asserts the CORRECT behavior (isolated misses, each recovered by
 * later pongs, must not close the connection) and is marked `.fails` because
 * the bug is currently present. When fixed, remove `.fails` and keep as a
 * regression test.
 */
describe('missed heartbeats should reset on received pong', () => {
  let client: Websocket | undefined;
  let server: WebsocketServerWithHeartbeat | undefined;
  let url: string;

  beforeEach(async () => {
    server = await startServerWithHeartbeat(0, 5000);
    const address = server.address();
    const port =
      typeof address === 'object' && address !== null ? address.port : 0;
    url = `ws://localhost:${port}`;
  });

  afterEach(async () => {
    await stopClient(client, 5000);
    await stopServer(server, 5000);
    client = undefined;
    server = undefined;
  });

  test.fails(
    'non-consecutive misses, each recovered, do not close the connection',
    async () => {
      const missed: number[] = [];
      let closed = false;

      client = new WebsocketBuilder(url)
        .withBackoff(new ConstantBackoff(60_000)) // don't reconnect during test
        .withHeartbeat({
          interval: 150,
          timeout: 80,
          pingMessage: 'ping',
          pongMessage: 'pong',
          maxMissedHeartbeats: 2,
        })
        .build();

      client.addEventListener(WebsocketEvent.HeartbeatMissed, (_w, e) => {
        missed.push((e as CustomEvent).detail.missedHeartbeats);
      });
      client.addEventListener(WebsocketEvent.Close, () => {
        closed = true;
      });

      await new Promise<void>((resolve) =>
        client!.addEventListener(WebsocketEvent.Open, () => resolve(), {
          once: true,
        })
      );

      const missOne = async () => {
        server!.setRespondToPings(false);
        const target = missed.length + 1;
        while (missed.length < target) {
          await new Promise((r) => setTimeout(r, 20));
        }
        server!.setRespondToPings(true);
        // several healthy ping/pong cycles — these pongs should reset the
        // missed-heartbeat counter
        await new Promise((r) => setTimeout(r, 500));
      };

      await missOne(); // isolated miss #1, recovered
      expect(closed).toBe(false);
      await missOne(); // isolated miss #2, recovered
      expect(closed).toBe(false);
      await missOne(); // isolated miss #3, recovered
      await new Promise((r) => setTimeout(r, 300));

      // CORRECT behavior: each miss was followed by healthy pongs, so the
      // counter should have reset and the connection should stay open.
      // CURRENT behavior: counter accumulates 1, 2, 3 and the connection is
      // closed with "No heartbeat received".
      expect(closed).toBe(false);
    },
    20_000
  );
});
