import { isErr, isOk } from '@core/util/maybeResult';
import { invalidateGitHubLinks, useGitHubLinksQuery } from '@queries/github/link';
import { authServiceClient } from '@service-auth/client';
import type { InitGitHubResponse } from '@service-auth/generated/schemas';
import { err, okAsync, ResultAsync } from 'neverthrow';
import { createMemo, onCleanup, onMount } from 'solid-js';

function hasGitHubLinks(query: ReturnType<typeof useGitHubLinksQuery>) {
  if (!query.data || query.error) {
    return false;
  }
  return query.data.links.length > 0;
}

export function useGitHubLinksStatus() {
  const query = useGitHubLinksQuery();
  return createMemo(() => {
    return hasGitHubLinks(query);
  });
}

type GitHubInitError =
  | { tag: 'AlreadyLinked' }
  | { tag: 'FailedToInit'; message: string };

/**
 * Initiates GitHub OAuth flow for integration.
 * Opens a popup window for user to authorize GitHub access.
 *
 * @returns ok if OAuth URL was opened, err if initialization failed
 */
function connectGitHub(): ResultAsync<void, GitHubInitError> {
  return ResultAsync.fromSafePromise(authServiceClient.initGithub()).andThen(
    (response) => {
      if (isOk(response)) {
        const data = response[1] as InitGitHubResponse;
        // Open OAuth popup
        window.open(data.authorization_url, '_blank', 'width=600,height=700');
        return okAsync(undefined);
      }

      // Handle errors
      const errors = response[0];
      const alreadyLinkedError = errors.find((e) => e.code === 'BAD_REQUEST');
      if (alreadyLinkedError) {
        return err({ tag: 'AlreadyLinked' as const });
      }

      return err({
        tag: 'FailedToInit' as const,
        message: 'Failed to initialize GitHub connection',
      });
    }
  );
}

/**
 * Disconnects the GitHub account from the current user.
 *
 * @returns ok if disconnected successfully, err if disconnection failed
 */
function disconnectGitHubAccount(): ResultAsync<void, 'failed-to-disconnect'> {
  return ResultAsync.fromSafePromise(authServiceClient.disconnectGithub()).andThen(
    (response) =>
      isOk(response) ? okAsync(void 0) : err('failed-to-disconnect')
  );
}

/**
 * Hooks for interacting with GitHub links.
 */
export function useGitHubLinks() {
  const invalidations = async () => {
    invalidateGitHubLinks();
  };

  const query = useGitHubLinksQuery();

  // Listen for messages from OAuth popup window
  onMount(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('Received message:', event.data);
      // Accept messages from any origin for OAuth callback
      // The message structure ensures we only process our messages
      if (event.data?.type === 'github-linked' && event.data?.success) {
        console.log('GitHub linked message received, invalidating query');
        invalidateGitHubLinks();
      }
    };

    console.log('Setting up GitHub OAuth message listener');
    window.addEventListener('message', handleMessage);

    onCleanup(() => {
      console.log('Cleaning up GitHub OAuth message listener');
      window.removeEventListener('message', handleMessage);
    });
  });

  return {
    query: query,
    isConnected: () => hasGitHubLinks(query),
    connect: () => connectGitHub().andTee(invalidations),
    disconnect: () => disconnectGitHubAccount().andTee(invalidations),
    invalidate: () => invalidateGitHubLinks(),
  };
}
