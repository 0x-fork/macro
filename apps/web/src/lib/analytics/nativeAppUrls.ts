import type { CaptureResult } from 'posthog-js';

/**
 * URL normalization for analytics events sent from the Tauri apps.
 *
 * The native apps serve the SPA from a custom origin — `tauri://localhost`
 * on macOS/Linux/iOS/Android and `https://tauri.localhost` on Windows — so
 * posthog-js reports `$host` as `localhost`/`tauri.localhost` and
 * `$current_url` as `tauri://localhost#/...`. PostHog's project-level
 * "filter test accounts" filter excludes events whose `$host` matches
 * `^(localhost|127.0.0.1)($|:)`, which classifies every native-app user as
 * internal test traffic: their events vanish from test-filtered insights
 * and their session recordings are hidden from the filtered replay list.
 * Rewriting the URL-shaped properties to the canonical web origin keeps
 * native-app traffic attributed to macro.com like every other user, and
 * makes URL-based breakdowns meaningful for app sessions.
 */

const TAURI_ORIGINS = ['tauri://localhost', 'https://tauri.localhost'] as const;

// Same check as DEV_MODE_ENV in @core/constant/featureFlags, inlined so this
// module stays dependency-free (featureFlags transitively constructs the
// analytics singleton, which this module must not depend on).
const WEB_APP_ORIGIN =
  import.meta.env.MODE === 'development'
    ? 'https://dev.macro.com'
    : 'https://macro.com';

type PropertyBag = Record<string, unknown>;

interface UrlPropertyGroup {
  /** Property holding a full URL; rewriting it drives the group. */
  url: string;
  /** Property holding the URL's host, kept in sync when `url` is rewritten. */
  host?: string;
  /** Property holding the URL's pathname, kept in sync when `url` is rewritten. */
  pathname?: string;
  /** Property holding a referring domain, kept in sync when `url` is rewritten. */
  domain?: string;
}

const EVENT_URL_GROUPS: UrlPropertyGroup[] = [
  { url: '$current_url', host: '$host', pathname: '$pathname' },
  {
    url: '$session_entry_url',
    host: '$session_entry_host',
    pathname: '$session_entry_pathname',
  },
  { url: '$referrer', domain: '$referring_domain' },
  {
    url: '$session_entry_referrer',
    domain: '$session_entry_referring_domain',
  },
];

const SET_ONCE_URL_GROUPS: UrlPropertyGroup[] = [
  {
    url: '$initial_current_url',
    host: '$initial_host',
    pathname: '$initial_pathname',
  },
  { url: '$initial_referrer', domain: '$initial_referring_domain' },
];

function matchTauriOrigin(url: string): string | undefined {
  return TAURI_ORIGINS.find((origin) => {
    if (!url.startsWith(origin)) return false;
    const next = url.charAt(origin.length);
    return next === '' || next === '/' || next === '#' || next === '?';
  });
}

/**
 * Maps a Tauri-origin URL to its canonical web equivalent. The native apps
 * use hash routing at the root, while the web app serves the same routes
 * under `/app`, so `tauri://localhost#/chat/123` becomes
 * `https://macro.com/app/chat/123`. Non-Tauri URLs are returned unchanged.
 */
export function canonicalizeTauriUrl(url: string): string {
  const origin = matchTauriOrigin(url);
  if (!origin) return url;

  const rest = url.slice(origin.length);
  const hashIndex = rest.indexOf('#');
  const route = hashIndex >= 0 ? rest.slice(hashIndex + 1) : rest;
  const path = route === '' || route === '/' ? '/' : route;
  return `${WEB_APP_ORIGIN}/app${path.startsWith('/') ? path : `/${path}`}`;
}

function normalizeGroups(bag: PropertyBag, groups: UrlPropertyGroup[]): void {
  for (const group of groups) {
    const raw = bag[group.url];
    if (typeof raw !== 'string') continue;

    const canonical = canonicalizeTauriUrl(raw);
    if (canonical === raw) continue;
    bag[group.url] = canonical;

    const parsed = new URL(canonical);
    if (group.host && typeof bag[group.host] === 'string') {
      bag[group.host] = parsed.host;
    }
    if (group.pathname && typeof bag[group.pathname] === 'string') {
      bag[group.pathname] = parsed.pathname;
    }
    if (group.domain && typeof bag[group.domain] === 'string') {
      bag[group.domain] = parsed.host;
    }
  }
}

/**
 * Recent posthog-js versions send initial person info in a compact
 * `$initial_person_info: { r: referrer, u: url }` shape that the server
 * expands into `$initial_*` person properties.
 */
function normalizePersonInfo(setOnce: PropertyBag): void {
  const info = setOnce.$initial_person_info;
  if (!info || typeof info !== 'object') return;

  const record = info as PropertyBag;
  for (const key of ['u', 'r']) {
    const value = record[key];
    if (typeof value === 'string') {
      record[key] = canonicalizeTauriUrl(value);
    }
  }
}

/**
 * Rewrites all Tauri-origin URL properties on a captured event (including
 * `$set_once` initial person properties) to the canonical web origin.
 * Intended to run in posthog's `before_send`; mutates the event in place.
 * Events without Tauri-origin URLs are left untouched, so this is safe to
 * run on every platform.
 */
export function normalizeNativeAppUrls(event: CaptureResult): void {
  if (event.properties) {
    normalizeGroups(event.properties, EVENT_URL_GROUPS);
  }

  for (const setOnce of [event.properties?.$set_once, event.$set_once]) {
    if (setOnce && typeof setOnce === 'object') {
      normalizeGroups(setOnce as PropertyBag, SET_ONCE_URL_GROUPS);
      normalizePersonInfo(setOnce as PropertyBag);
    }
  }
}
