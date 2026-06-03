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

export const handlers = [
  // --- auth-service ---
  http.post('*/jwt/refresh', () => HttpResponse.json({})),

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

  http.get('*/channels/activity', () => HttpResponse.json([])),

  http.get('*/instructions', () =>
    HttpResponse.json({ documentId: 'demo-doc-welcome' })
  ),

  http.get('*/history', () => HttpResponse.json([])),

  http.post('*/user/profile_pictures', () =>
    HttpResponse.json({ pictures: [] })
  ),

  http.get('*/contacts', () => HttpResponse.json({ contacts: [] })),

  http.get('*/properties/definitions', () => HttpResponse.json([])),

  http.get('*/email/links', () => HttpResponse.json({ links: [] })),

  http.get('*/scheduled-actions', () => HttpResponse.json([])),

  http.get('*/items/:id', ({ params }) => {
    const doc = DEMO_DOCS.find((d) => d.id === params.id);
    if (!doc) return HttpResponse.json({}, { status: 404 });
    return HttpResponse.json(doc);
  }),

  // Catch-all: block every cross-origin request so no real API ever gets
  // hit. Same-origin requests (Vite dev server, HMR, static assets) fall
  // through to the network. Keep this last.
  http.all('*', ({ request }) => {
    const url = new URL(request.url);
    if (url.origin === window.location.origin) return;
    console.warn('[demo] blocked', request.method, url.href);
    return HttpResponse.json({}, { status: 200 });
  }),
];
