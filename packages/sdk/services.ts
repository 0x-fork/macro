/**
 * The backend services the SDK is generated against. Consumed by
 * openapi-ts.config.ts, which reads each service's openapi.json directly from
 * the app's service-clients package.
 */
export const services = [
  'auth',
  'cognition',
  'connection',
  'contacts',
  'email',
  'notification',
  'properties',
  'scheduled-action',
  'search',
  'static-files',
  'storage',
  'unfurl',
] as const;

export type ServiceSpec = (typeof services)[number];
