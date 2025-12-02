// Query client
export { queryClient, useQueryClient } from './client';

// Service client utilities
export {
  authInterceptor,
  createServiceClient,
  type ServiceClientOptions,
  type ServiceName,
} from './service-client';

// Merged query keys
export { queryKeys } from './keys';

// Auth domain
export * from './auth';

// Email domain
export * from './email';
