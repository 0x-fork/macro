/**
 * @file Lazy loaders for livekit-client and the Krisp noise filter.
 *
 * livekit-client + @livekit/krisp-noise-filter are by far the heaviest
 * dependencies reachable from the app shell (the Krisp package inlines its
 * audio worklet + model). CallProvider mounts app-wide, so everything it
 * touches loads with the initial bundle — these loaders keep both SDKs out of
 * that path; they are fetched when a call actually starts (or a media device
 * changes while the call stack is live).
 */
import type {
  ConnectionState,
  DisconnectReason,
  RoomEvent,
  Track,
} from 'livekit-client';

type LivekitModule = typeof import('livekit-client');
type KrispModule = typeof import('@livekit/krisp-noise-filter');

let livekit: LivekitModule | null = null;
let livekitPromise: Promise<LivekitModule> | null = null;
let krisp: KrispModule | null = null;
let krispPromise: Promise<KrispModule> | null = null;

export function loadLivekit(): Promise<LivekitModule> {
  livekitPromise ??= import('livekit-client').then((m) => {
    livekit = m;
    return m;
  });
  return livekitPromise;
}

/** Sync access to livekit-client; null until loadLivekit() resolves. */
export function getLivekit(): LivekitModule | null {
  return livekit;
}

export function loadKrisp(): Promise<KrispModule> {
  krispPromise ??= import('@livekit/krisp-noise-filter').then((m) => {
    krisp = m;
    return m;
  });
  return krispPromise;
}

/** Sync access to the Krisp module; null until loadKrisp() resolves. */
export function getKrisp(): KrispModule | null {
  return krisp;
}

/**
 * True when the Krisp module is loaded and reports browser support. Call
 * sites that can await should loadKrisp() first; until it resolves this
 * reports false and callers fall back to browser-native noise suppression.
 */
export function isKrispSupported(): boolean {
  return krisp?.isKrispNoiseFilterSupported() ?? false;
}

// Mirrors of livekit-client's string enums so call state can be tracked
// without loading the SDK. Each value is asserted to the corresponding enum
// member's type, so a livekit-client upgrade that changes a value fails to
// compile here.
export const LK_CONNECTION_STATE = {
  Disconnected: 'disconnected' as ConnectionState.Disconnected,
  Connecting: 'connecting' as ConnectionState.Connecting,
  Connected: 'connected' as ConnectionState.Connected,
  Reconnecting: 'reconnecting' as ConnectionState.Reconnecting,
  SignalReconnecting:
    'signalReconnecting' as ConnectionState.SignalReconnecting,
} as const;

export const LK_TRACK_SOURCE = {
  Camera: 'camera' as Track.Source.Camera,
  Microphone: 'microphone' as Track.Source.Microphone,
  ScreenShare: 'screen_share' as Track.Source.ScreenShare,
} as const;

export const LK_ROOM_EVENT = {
  Disconnected: 'disconnected' as RoomEvent.Disconnected,
} as const;

// DisconnectReason comes from @livekit/protocol — protobuf wire values,
// stable by definition. The satisfies clause pins each literal to the enum
// member's type so a renumbering fails to compile.
export const LK_DISCONNECT_REASON = {
  CLIENT_INITIATED: 1,
  DUPLICATE_IDENTITY: 2,
  PARTICIPANT_REMOVED: 4,
  ROOM_DELETED: 5,
  ROOM_CLOSED: 10,
} as const satisfies {
  CLIENT_INITIATED: DisconnectReason.CLIENT_INITIATED;
  DUPLICATE_IDENTITY: DisconnectReason.DUPLICATE_IDENTITY;
  PARTICIPANT_REMOVED: DisconnectReason.PARTICIPANT_REMOVED;
  ROOM_DELETED: DisconnectReason.ROOM_DELETED;
  ROOM_CLOSED: DisconnectReason.ROOM_CLOSED;
};
