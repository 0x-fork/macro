// Demo-mode initializer. Must run before any other code that might
// construct a WebSocket or fire a fetch at module-load time.
//
// The synchronous block installs proxies for both WebSocket and fetch so
// no cross-origin request can leave the browser. MSW boots in the
// background; the fetch proxy queues cross-origin requests on a promise
// until MSW's service worker is registered, then lets them through so
// MSW can return mocked responses.
//
// Self-noops outside demo builds.

if (import.meta.env.VITE_DEMO === 'true') {
  installWebSocketStub();
  primeLoginState();
  installFetchGate(startMSW());
}

function installWebSocketStub() {
  const Original = globalThis.WebSocket;
  const sameOriginWs = window.location.origin.replace(/^http/, 'ws');

  class StubWebSocket extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;
    readyState = 1;
    url: string;
    binaryType: BinaryType = 'blob';
    bufferedAmount = 0;
    extensions = '';
    protocol = '';
    onopen: ((e: Event) => void) | null = null;
    onclose: ((e: CloseEvent) => void) | null = null;
    onerror: ((e: Event) => void) | null = null;
    onmessage: ((e: MessageEvent) => void) | null = null;

    constructor(url: string | URL) {
      super();
      this.url = String(url);
      console.warn('[demo] blocked WebSocket', this.url);
      queueMicrotask(() => {
        const ev = new Event('open');
        this.onopen?.(ev);
        this.dispatchEvent(ev);
      });
    }
    send() {}
    close() {
      this.readyState = 3;
      const ev = new CloseEvent('close');
      this.onclose?.(ev);
      this.dispatchEvent(ev);
    }
  }

  globalThis.WebSocket = new Proxy(Original, {
    construct(target, args) {
      const url = String(args[0] ?? '');
      if (url.startsWith(sameOriginWs)) return Reflect.construct(target, args);
      return new StubWebSocket(url) as unknown as WebSocket;
    },
  });
}

function primeLoginState() {
  // See core/util/cookies.ts:hasLoginCookie.
  localStorage.setItem('macro:login', 'true');
  document.cookie = 'login=true; path=/; SameSite=Lax';
}

function installFetchGate(mswReady: Promise<void>) {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async function patchedFetch(input, init) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    try {
      const u = new URL(url, window.location.origin);
      if (u.origin !== window.location.origin) await mswReady;
    } catch {
      // unparsable URL — let fetch handle it
    }
    return realFetch(input, init);
  };
}

async function startMSW() {
  const { setupWorker } = await import('msw/browser');
  const { handlers } = await import('./handlers');
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    quiet: true,
  });
  console.log('[demo] init complete — no requests will leave the browser');
}
