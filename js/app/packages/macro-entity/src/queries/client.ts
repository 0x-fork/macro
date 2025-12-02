import { queryClient as client } from '@queries';

// Re-export from @queries for backwards compatibility
// Prefer importing from @queries directly
export const queryClient = client;

export function useQueryClient() {
  return queryClient;
}
