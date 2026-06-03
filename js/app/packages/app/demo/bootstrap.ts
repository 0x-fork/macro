// Demo-mode bootstrap. Starts MSW, blocks cross-origin WebSockets, and
// primes the auth state so the app boots into a logged-in single-user
// session against in-memory data. No request ever leaves the browser.
//
// Called from index.tsx only when `import.meta.env.VITE_DEMO === 'true'`,
// so this module (and `msw`) are stripped from the normal build.

import { handlers } from './handlers';

export async function bootstrapDemo() {
  blockCrossOriginWebSockets();

  // Prime the auth gate: see core/util/cookies.ts:hasLoginCookie.
  localStorage.setItem('macro:login', 'true');
  document.cookie = 'login=true; path=/; SameSite=Lax';

  const { setupWorker } = await import('msw/browser');
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });

  console.log('[demo] MSW running — single-user demo workspace booted');
}

// MSW intercepts fetch/XHR but not WebSocket. Replace cross-origin WS
// connections with a no-op stub that pretends to open and never receives
// anything; same-origin (Vite HMR) goes through untouched.
function blockCrossOriginWebSockets() {
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
