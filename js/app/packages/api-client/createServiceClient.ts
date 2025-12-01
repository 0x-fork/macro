import { createClient, type Client, type Config } from '@hey-api/client-fetch';
import { SERVER_HOSTS } from '@core/constant/servers';
import { authInterceptor } from './interceptors/auth';

export type ServiceName = keyof typeof SERVER_HOSTS;

export interface ServiceClientOptions {
  /** Skip adding the auth interceptor (useful for public endpoints) */
  skipAuth?: boolean;
  /** Additional client configuration */
  config?: Partial<Config>;
}

/**
 * Creates a configured hey-api client for a specific service.
 *
 * Features:
 * - Automatic base URL from SERVER_HOSTS
 * - Bearer token authentication via interceptor
 * - Configurable per-service options
 *
 * @example
 * ```ts
 * const emailClient = createServiceClient('email-service');
 *
 * // Use with generated SDK functions
 * import { getThread } from './generated/sdk.gen';
 * const result = await getThread({ path: { id: threadId }, client: emailClient });
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
