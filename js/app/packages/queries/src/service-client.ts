/**
 * Service Client utilities for configuring hey-api clients with auth.
 */

import { SERVER_HOSTS } from '@core/constant/servers';
import { type Client, type Config, createClient } from '@hey-api/client-fetch';
import { getMacroApiToken } from '@service-auth/fetch';

export type ServiceName = keyof typeof SERVER_HOSTS;

export interface ServiceClientOptions {
  /** Skip adding the auth interceptor (useful for public endpoints) */
  skipAuth?: boolean;
  /** Additional client configuration */
  config?: Partial<Config>;
}

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
      console.error('Failed to get API token:', error);
    }
    return request;
  });
}

/**
 * Creates a configured hey-api client for a specific service.
 *
 * @example
 * ```ts
 * const emailClient = createServiceClient('email-service');
 * ```
 */
export function createServiceClient(
  serviceName: ServiceName,
  options: ServiceClientOptions = {}
): Client {
  const { skipAuth = false, config = {} } = options;

  const client = createClient({
    baseUrl: SERVER_HOSTS[serviceName],
    ...config,
  });

  if (!skipAuth) {
    authInterceptor(client);
  }

  return client;
}
