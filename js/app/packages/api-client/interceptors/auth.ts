import type { Client } from '@hey-api/client-fetch';
import { getMacroApiToken } from '@service-auth/fetch';

/**
 * Adds Bearer token authentication to all requests.
 * Uses the shared getMacroApiToken() function which handles token caching and refresh.
 */
export function authInterceptor(client: Client): void {
  client.interceptors.request.use(async (request) => {
    try {
      const token = await getMacroApiToken();
      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch (error) {
      // Token retrieval failed - request will proceed without auth
      // The server will return 401 which can be handled by error interceptor
      console.error('Failed to get API token:', error);
    }
    return request;
  });
}
