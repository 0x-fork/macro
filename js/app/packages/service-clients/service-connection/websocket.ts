import { createBlockEffect, inBlock } from '@core/block';
import { ENABLE_BEARER_TOKEN_AUTH } from '@core/constant/featureFlags';
import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchToken, unsetTokenPromise } from '@core/util/fetchWithToken';
import { getMacroApiToken } from '@service-auth/fetch';
import { createCallback } from '@solid-primitives/rootless';
import {
  ArrayQueue,
  createSocketEffect,
  JsonSerializer,
  LinearBackoff,
  type Websocket,
  WebsocketBuilder,
} from '@websocket';
import { createWebsocketStateSignal } from '@websocket/solid/state-signal';
import type { ToWebsocketMessage } from './generated/schemas/toWebsocketMessage';

const wsHost: string = SERVER_HOSTS['connection-gateway'];

export type ConnectionGatewayWebsocket = Websocket<
  ToWebsocketMessage,
  FromWebsocketMessage
>;

export type FromWebsocketMessage = {
  type: string;
  data: any;
};

async function resolveWsUrl() {
  // jsdom's WebSocket cannot connect (its 'ws' backend is stubbed out in
  // browser builds) and throws inside its own async internals where no
  // caller can catch, failing vitest runs with unhandled errors whenever
  // this module-scope singleton is reached through an import graph. Bail
  // before any fetch; the connect error is caught and retried normally.
  if (import.meta.env.MODE === 'test') {
    throw new Error('Websocket connections are disabled under vitest');
  }
  if (ENABLE_BEARER_TOKEN_AUTH) {
    const apiToken = await getMacroApiToken();
    if (!apiToken) throw new Error('No Macro API token');

    return `${wsHost}/?macro-api-token=${apiToken}`;
  }
  // Clear any cached token promise to force a fresh refresh on reconnect
  unsetTokenPromise();
  await fetchToken();
  return wsHost;
}

export const ws = new WebsocketBuilder(resolveWsUrl)
  .withSerializer(
    new JsonSerializer<ToWebsocketMessage, FromWebsocketMessage>()
  )
  .withBuffer(new ArrayQueue())
  .withBackoff(new LinearBackoff(500, 500))
  .withMaxRetries(20)
  .withHeartbeat({
    interval: 1_000,
    timeout: 1_000,
    pingMessage: 'ping',
    pongMessage: 'pong',
    maxMissedHeartbeats: 3,
  })
  .build();

function reconnectIfDisconnected() {
  ws.reconnectIfDisconnected();
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') {
    reconnectIfDisconnected();
  }
}

// When the browser regains connectivity or a background tab becomes visible,
// kick the connection immediately instead of waiting for heartbeat/backoff
// timers, which may have been throttled while the tab was stale.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('online', reconnectIfDisconnected);
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export const state = createWebsocketStateSignal(ws);
// TODO: add type mapping on the websocket event
export function createConnectionBlockWebsocketEffect(
  callback: (data: FromWebsocketMessage) => void
) {
  createBlockEffect(() => {
    const wrappedCallback = createCallback((data) => {
      return inBlock(callback)(data);
    });
    createSocketEffect(ws, wrappedCallback);
  });
}

export function createConnectionWebsocketEffect(
  callback: (data: FromWebsocketMessage) => void
) {
  createSocketEffect(ws, callback);
}
