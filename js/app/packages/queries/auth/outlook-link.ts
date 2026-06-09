import { authServiceClient } from '@service-auth/client';
import { useMutation } from '@tanstack/solid-query';

/**
 * Mutation that asks auth-service for the Microsoft OAuth authorization URL for
 * adding an Outlook inbox to the already-authenticated user. Callers consume the
 * `authorization_url` and navigate the browser to it. Mirrors
 * {@link useInitGmailLink}.
 */
export function useInitOutlookLink() {
  return useMutation(() => ({
    mutationFn: async (originalUrl: string) => {
      return authServiceClient.initOutlookLink(originalUrl);
    },
  }));
}
