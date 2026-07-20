import type { CaptureResult } from 'posthog-js';
import { describe, expect, it } from 'vitest';
import { canonicalizeTauriUrl, normalizeNativeAppUrls } from './nativeAppUrls';

function makeEvent(
  properties: Record<string, unknown>,
  setOnce?: Record<string, unknown>
): CaptureResult {
  return {
    uuid: '019f0000-0000-7000-8000-000000000000',
    event: '$pageview',
    properties,
    ...(setOnce ? { $set_once: setOnce } : {}),
  } as CaptureResult;
}

describe('canonicalizeTauriUrl', () => {
  it('maps hash routes to the web /app path', () => {
    expect(canonicalizeTauriUrl('tauri://localhost#/component/inbox')).toBe(
      'https://macro.com/app/component/inbox'
    );
    expect(canonicalizeTauriUrl('tauri://localhost/#/component/inbox')).toBe(
      'https://macro.com/app/component/inbox'
    );
  });

  it('maps the Windows origin', () => {
    expect(
      canonicalizeTauriUrl('https://tauri.localhost/#/component/inbox')
    ).toBe('https://macro.com/app/component/inbox');
  });

  it('preserves query params inside the hash route', () => {
    expect(canonicalizeTauriUrl('tauri://localhost#/chat/123?foo=1')).toBe(
      'https://macro.com/app/chat/123?foo=1'
    );
  });

  it('maps root urls to /app/', () => {
    expect(canonicalizeTauriUrl('tauri://localhost')).toBe(
      'https://macro.com/app/'
    );
    expect(canonicalizeTauriUrl('tauri://localhost/')).toBe(
      'https://macro.com/app/'
    );
    expect(canonicalizeTauriUrl('tauri://localhost#/')).toBe(
      'https://macro.com/app/'
    );
  });

  it('leaves non-tauri urls unchanged', () => {
    for (const url of [
      'https://macro.com/app/component/inbox',
      'https://macro.com/?utm_source=ig',
      'http://localhost:3000/app',
      'https://tauri.localhost.evil.com/phish',
      '$direct',
    ]) {
      expect(canonicalizeTauriUrl(url)).toBe(url);
    }
  });
});

describe('normalizeNativeAppUrls', () => {
  it('rewrites url, host, and pathname together', () => {
    const event = makeEvent({
      $current_url: 'tauri://localhost#/component/inbox',
      $host: 'localhost',
      $pathname: '/',
    });

    normalizeNativeAppUrls(event);

    expect(event.properties).toMatchObject({
      $current_url: 'https://macro.com/app/component/inbox',
      $host: 'macro.com',
      $pathname: '/app/component/inbox',
    });
  });

  it('rewrites session entry properties', () => {
    const event = makeEvent({
      $session_entry_url: 'tauri://localhost#/',
      $session_entry_host: 'localhost',
      $session_entry_pathname: '/',
      $session_entry_referrer: 'tauri://localhost#/component/inbox',
      $session_entry_referring_domain: 'localhost',
    });

    normalizeNativeAppUrls(event);

    expect(event.properties).toMatchObject({
      $session_entry_url: 'https://macro.com/app/',
      $session_entry_host: 'macro.com',
      $session_entry_pathname: '/app/',
      $session_entry_referrer: 'https://macro.com/app/component/inbox',
      $session_entry_referring_domain: 'macro.com',
    });
  });

  it('rewrites initial person properties in $set_once', () => {
    const event = makeEvent(
      {
        $current_url: 'tauri://localhost#/',
        $set_once: {
          $initial_current_url: 'tauri://localhost#/component/inbox',
          $initial_host: 'localhost',
          $initial_pathname: '/',
        },
      },
      {
        $initial_person_info: {
          r: '$direct',
          u: 'tauri://localhost#/component/inbox',
        },
      }
    );

    normalizeNativeAppUrls(event);

    expect(event.properties.$set_once).toMatchObject({
      $initial_current_url: 'https://macro.com/app/component/inbox',
      $initial_host: 'macro.com',
      $initial_pathname: '/app/component/inbox',
    });
    expect(event.$set_once).toMatchObject({
      $initial_person_info: {
        r: '$direct',
        u: 'https://macro.com/app/component/inbox',
      },
    });
  });

  it('does not touch web events', () => {
    const properties = {
      $current_url: 'https://macro.com/app/component/inbox',
      $host: 'macro.com',
      $pathname: '/app/component/inbox',
      $referrer: 'https://www.google.com/',
      $referring_domain: 'www.google.com',
    };
    const event = makeEvent({ ...properties });

    normalizeNativeAppUrls(event);

    expect(event.properties).toMatchObject(properties);
  });

  it('does not misclassify a localhost dev server as the native app', () => {
    const event = makeEvent({
      $current_url: 'http://localhost:3000/app/component/inbox',
      $host: 'localhost:3000',
      $pathname: '/app/component/inbox',
    });

    normalizeNativeAppUrls(event);

    expect(event.properties).toMatchObject({
      $current_url: 'http://localhost:3000/app/component/inbox',
      $host: 'localhost:3000',
    });
  });

  it('handles events without properties', () => {
    const event = { event: 'x' } as CaptureResult;
    expect(() => normalizeNativeAppUrls(event)).not.toThrow();
  });
});
