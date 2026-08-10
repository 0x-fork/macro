/**
 * Minimal client for Nango's hosted Connect UI (https://connect.nango.dev).
 *
 * Vendored from `@nangohq/frontend`'s `ConnectUI` (MIT-style Elastic license,
 * https://github.com/NangoHQ/nango) rather than adding the dependency: the
 * protocol is a fullscreen iframe plus a tiny postMessage contract (send a
 * `session_token`, receive `ready`/`connect`/`error`/`close` events), and
 * this is the only piece of the SDK we use.
 */

const CONNECT_UI_URL = 'https://connect.nango.dev';

/** Successful authorization payload sent by the Connect UI. */
export interface NangoConnectSuccess {
  providerConfigKey: string;
  connectionId: string;
}

export type NangoConnectUIEvent =
  | { type: 'ready' }
  | { type: 'close' }
  | { type: 'connect'; payload: NangoConnectSuccess }
  | { type: 'error'; payload: { errorType: string; errorMessage: string } };

export interface NangoConnectUIHandle {
  /** Remove the iframe and stop listening. Safe to call repeatedly. */
  close: () => void;
}

/**
 * Open the Nango Connect UI as a fullscreen iframe and stream its events to
 * `onEvent`. The iframe removes itself when the UI reports `close`; callers
 * that settle earlier (e.g. after `connect` completes) should call
 * `handle.close()` themselves.
 */
export function openNangoConnectUI(options: {
  sessionToken: string;
  onEvent: (event: NangoConnectUIEvent) => void;
}): NangoConnectUIHandle {
  const origin = new URL(CONNECT_UI_URL).origin;

  const iframe = document.createElement('iframe');
  // Connect UI's built assets use relative paths: they only resolve when the
  // document path ends with '/'.
  iframe.src = `${CONNECT_UI_URL}/`;
  iframe.id = 'nango-connect-ui';
  iframe.style.position = 'fixed';
  iframe.style.zIndex = '9999';
  iframe.style.inset = '0';
  iframe.style.width = '100vw';
  iframe.style.height = '100vh';
  iframe.style.border = 'none';
  iframe.style.backgroundColor = 'transparent';
  iframe.allow = 'clipboard-write';

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener('message', listener);
    iframe.remove();
    document.body.style.overflow = '';
  };

  const listener = (event: MessageEvent) => {
    if (event.origin !== origin) return;
    const data: unknown = event.data;
    if (typeof data !== 'object' || data === null || !('type' in data)) return;
    const evt = data as NangoConnectUIEvent;

    if (evt.type === 'ready') {
      // The UI shows a loader until it receives the session token.
      iframe.contentWindow?.postMessage(
        { type: 'session_token', sessionToken: options.sessionToken },
        origin
      );
    }
    if (evt.type === 'close') close();
    options.onEvent(evt);
  };

  window.addEventListener('message', listener, false);
  document.body.append(iframe);
  document.body.style.overflow = 'hidden';

  return { close };
}
