/**
 * Macro web service worker (template; see serviceWorkerPlugin in
 * vite.base.ts, which stamps __BUILD_VERSION__ and emits this at
 * dist/sw.js — served from /app/sw.js with Cache-Control: no-cache so
 * browsers re-check it on navigations and deploys propagate promptly).
 *
 * Strategy, deliberately minimal and dependency-free:
 * - The HTML shell is precached, so SPA navigations are served instantly
 *   with zero network round trip and the app works offline; a background
 *   revalidation refreshes the cached shell (stale-while-revalidate),
 *   so a deploy lands on the following navigation.
 * - Content-hashed build assets (js/css/fonts/wasm) are cached on first
 *   use and served cache-first: their names change with their content,
 *   so a cached entry can never be stale. They are intentionally NOT
 *   precached — that would re-download the whole app on every deploy.
 * - The shell cache is keyed by build version; activating a new worker
 *   drops old shell caches. The asset cache is shared across builds and
 *   trimmed by entry count.
 */

const BUILD_VERSION = '__BUILD_VERSION__';
const SHELL_CACHE = `macro-shell-${BUILD_VERSION}`;
const SHELL_CACHE_PREFIX = 'macro-shell-';
const ASSET_CACHE = 'macro-hashed-assets-v1';
const ASSET_CACHE_MAX_ENTRIES = 400;

const SHELL_URL = new URL('index.html', self.registration.scope).pathname;

const HASHED_ASSET_PATH = /\.(?:js|css|woff2?|wasm)$/;
// Navigations to real files (anything with an extension) are not SPA
// routes and must hit the network.
const FILE_LIKE_PATH = /\/[^/]*\.[^/]+$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // cache: 'reload' bypasses the HTTP cache so the precached shell is
      // the newest deployed one, not a stale browser-cache copy.
      await cache.add(new Request(SHELL_URL, { cache: 'reload' }));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== SHELL_CACHE
          )
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function respondWithShell(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(SHELL_URL);
  // Revalidate in the background regardless of a cache hit; 'no-cache'
  // forces a conditional request past the HTTP cache. waitUntil keeps the
  // worker alive until the refresh lands even after the cached response
  // has been returned.
  const refresh = fetch(new Request(SHELL_URL, { cache: 'no-cache' }))
    .then((response) => {
      if (response.ok) cache.put(SHELL_URL, response.clone());
      return response;
    })
    .catch(() => undefined);
  event.waitUntil(refresh);
  if (cached) return cached;
  const fresh = await refresh;
  return fresh ?? Response.error();
}

async function trimAssetCache(cache) {
  const keys = await cache.keys();
  if (keys.length <= ASSET_CACHE_MAX_ENTRIES) return;
  // keys() is oldest-first; drop from the front.
  await Promise.all(
    keys
      .slice(0, keys.length - ASSET_CACHE_MAX_ENTRIES)
      .map((request) => cache.delete(request))
  );
}

async function respondCacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    trimAssetCache(cache);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith('/app')) return;

  // SPA navigations: instant cached shell + background revalidation.
  if (request.mode === 'navigate' && !FILE_LIKE_PATH.test(url.pathname)) {
    event.respondWith(respondWithShell(event));
    return;
  }

  // Content-hashed assets: cache-first. Query strings (e.g. the stale-
  // build probe on index.html, ?worker urls) always pass through, as does
  // this worker's own script.
  if (
    HASHED_ASSET_PATH.test(url.pathname) &&
    url.search === '' &&
    !url.pathname.endsWith('/sw.js')
  ) {
    event.respondWith(respondCacheFirst(request));
  }
});
