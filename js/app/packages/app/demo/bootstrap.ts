// Demo-mode bootstrap. Starts MSW and primes the auth state so the app
// boots into a logged-in single-user session against in-memory data.
//
// Called from index.tsx only when `import.meta.env.VITE_DEMO === 'true'`,
// so this module (and `msw`) are stripped from the normal build.

import { handlers } from './handlers';

export async function bootstrapDemo() {
  // Prime the auth gate: see core/util/cookies.ts:hasLoginCookie.
  localStorage.setItem('macro:login', 'true');
  document.cookie = 'login=true; path=/; SameSite=Lax';

  const { setupWorker } = await import('msw/browser');
  const worker = setupWorker(...handlers);
  await worker.start({
    // Avoid noisy warnings for the catch-all unmocked routes; we already
    // log them ourselves in handlers.ts.
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/mockServiceWorker.js' },
  });

  console.log('[demo] MSW running — single-user demo workspace booted');
}
