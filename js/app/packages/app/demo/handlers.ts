// MSW request handlers for the demo build.
//
// Pattern: match on the URL path with a wildcard host (`*`) so handlers work
// regardless of which SERVER_HOSTS entry is in play (local/dev/prod).
// When the app calls an unmocked route in demo mode, the fallback at the
// bottom logs it and returns 200 with an empty body — extend with a real
// handler when something visibly breaks.

import { http, HttpResponse } from 'msw';
import {
  DEMO_CHANNELS,
  DEMO_DOCS,
  DEMO_PERMISSIONS,
  DEMO_SOUP_PAGE,
  DEMO_USER,
} from './seed';

// Hosts the app talks to. Any request matching one of these but not handled
// below is logged and returned as 200 `{}` so the demo doesn't crash —
// watch the console while clicking around to find routes worth mocking.
const MOCKED_HOSTS = [
  'auth-service',
  'cloud-storage',
  'document-cognition',
  'notifications',
  'static-file-service',
  'unfurl-service',
  'contacts',
  'email-service',
  'image-proxy',
  'agent-schedule',
];

function isBackendRequest(url: URL): boolean {
  return MOCKED_HOSTS.some((h) => url.hostname.includes(h));
}

export const handlers = [
  // --- auth-service ---
  http.get('*/user/legacy_user_permissions', () =>
    HttpResponse.json(DEMO_PERMISSIONS)
  ),

  http.get('*/user/me', () =>
    HttpResponse.json({
      user_id: DEMO_USER.userId,
      organization_id: DEMO_USER.organizationId,
      permissions: [],
    })
  ),

  http.get('*/user/organization', () =>
    HttpResponse.json({
      organizationId: DEMO_USER.organizationId,
      organizationName: DEMO_USER.organizationName,
    })
  ),

  http.post('*/user/get_names', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      user_ids?: string[];
    };
    const ids = body.user_ids ?? [DEMO_USER.userId];
    return HttpResponse.json({
      names: ids.map((id) => ({
        user_id: id,
        name: id === DEMO_USER.userId ? DEMO_USER.name : 'Teammate',
      })),
    });
  }),

  // --- document-storage-service ---
  http.get('*/ping', () => HttpResponse.json({ data: { success: true } })),

  http.get('*/comms/channels', () => HttpResponse.json(DEMO_CHANNELS)),

  http.post('*/items/soup', () => HttpResponse.json(DEMO_SOUP_PAGE)),
  http.post('*/items/soup/ast', () => HttpResponse.json(DEMO_SOUP_PAGE)),

  http.get('*/channels/:channelId/messages', () =>
    HttpResponse.json({ messages: [], next_cursor: null })
  ),

  http.get('*/items/:id', ({ params }) => {
    const doc = DEMO_DOCS.find((d) => d.id === params.id);
    if (!doc) return HttpResponse.json({}, { status: 404 });
    return HttpResponse.json(doc);
  }),

  // Catch-all: any other request to a known backend host gets a 200 `{}`
  // so the demo doesn't crash. Keep this last.
  http.all('*', ({ request }) => {
    const url = new URL(request.url);
    if (!isBackendRequest(url)) return;
    console.warn('[demo] unmocked', request.method, url.pathname);
    return HttpResponse.json({}, { status: 200 });
  }),
];
