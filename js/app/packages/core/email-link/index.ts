import { updateUserAuth } from '@core/auth';
import {
  authenticateWithEmailPermissions,
  type TimeoutError,
} from '@core/auth/channel';
import { openEmailAuthPopup } from '@core/auth/email';
import {
  disableSync,
  initUser,
  listLinks,
  queryClient,
  queryKeys,
} from '@queries';
import { updateUserInfo } from '@service-gql/client';
import { useQuery } from '@tanstack/solid-query';
import { err, okAsync, ResultAsync } from 'neverthrow';
import { createSignal } from 'solid-js';

export const [emailRefetchInterval, setEmailRefetchInterval] = createSignal<
  number | undefined
>();

async function fetchEmailLinks() {
  const { data, error } = await listLinks();
  if (error || !data) {
    throw new Error('Failed to fetch email links', { cause: error });
  }
  return (data as any)?.links ?? [];
}

export function useEmailLinksQuery() {
  return useQuery(() => ({
    ...queryKeys.email.links,
    queryFn: fetchEmailLinks,
    suspense: false,
    refetchOnMount: 'always',
  }));
}

export function useEmailLinksStatus() {
  const links = useEmailLinksQuery();
  return () => {
    if (!links.data || links.error) {
      return false;
    }
    return links.data?.length > 0;
  };
}

function invalidateEmailLinks() {
  // Invalidate email links query
  queryClient.invalidateQueries({
    queryKey: queryKeys.email.links.queryKey,
  });
  // Cancel and reset all email queries (previews, threads, etc.)
  queryClient.cancelQueries({ queryKey: queryKeys.email._def });
  queryClient.setQueriesData({ queryKey: queryKeys.email._def }, () => ({
    pages: [],
    pageParams: [],
  }));
}

type EmailInitError =
  /** The email link has already been initialized*/
  | { tag: 'AlreadyInitialized' }
  | { tag: 'FailedToInitialize'; message: string };

/**
 * Calls email service to start syncing and initialize a new email link.
 *
 * @returns ok if syncing was started, err if syncing failed
 */
function initEmailLink(): ResultAsync<void, EmailInitError> {
  const mapToError = (
    error: { message?: string } | Error | unknown
  ): EmailInitError => {
    const errorMessage =
      error instanceof Error
        ? error.message
        : ((error as { message?: string })?.message ?? String(error));
    const isBadRequest =
      errorMessage?.includes('400') || errorMessage?.includes('already');
    return isBadRequest
      ? { tag: 'AlreadyInitialized' }
      : {
          tag: 'FailedToInitialize',
          message: errorMessage || 'Failed to initialize',
        };
  };

  return ResultAsync.fromPromise(initUser(), mapToError).andThen(
    ({ error }) => {
      if (error) {
        return err(mapToError(error));
      }
      return okAsync(undefined);
    }
  );
}

/**
 * The time in ms between making a polling fetch for
 * new emails during the sync process.
 */
const EMAIL_POLLING_INTERVAL = 1_000;

/**
 * How long in ms we should poll for emails during the sync process.
 */
const EMAIL_POLLING_TIMEOUT = 20_000;

/**
 * Starts a polling fetch for new emails during the sync process.
 */
function startEmailPolling() {
  if (emailRefetchInterval()) return;
  setEmailRefetchInterval(EMAIL_POLLING_INTERVAL);
  setTimeout(() => {
    stopEmailPolling();
  }, EMAIL_POLLING_TIMEOUT);
}

/**
 * Stops the polling fetch for new emails during the sync process.
 */
function stopEmailPolling() {
  setEmailRefetchInterval(undefined);
}

/**
 * Disconnects the email service and invalidates the email links query.
 *
 * NOTE: only to be used in development
 *
 * @returns ok if the email service was disconnected, err if it failed to disconnect
 */
function disconnectEmail(): ResultAsync<void, 'failed-to-disconnect'> {
  return ResultAsync.fromSafePromise(disableSync()).andThen((response) =>
    response.error ? err('failed-to-disconnect') : okAsync(void 0)
  );
}

/**
 * Connects to the email service and authenticates with email permissions.
 *
 * @returns A promise that resolves when the auth success message is received.
 */
function connectEmail(): ResultAsync<void, TimeoutError> {
  openEmailAuthPopup({
    idpName: 'google_gmail',
    returnPath: '/app/login/popup/success',
  });

  return authenticateWithEmailPermissions();
}

/**
 * Hooks for interacting with email links.
 */
export function useEmailLinks() {
  const invalidations = async () => {
    invalidateEmailLinks();
    await updateUserAuth();
    await updateUserInfo();
  };

  const query = useEmailLinksQuery();

  return {
    query: query,
    status: useEmailLinksStatus(),
    initEmailLink: () =>
      initEmailLink().map(startEmailPolling).map(invalidations),
    connect: () =>
      connectEmail()
        .andThen(initEmailLink)
        .map(startEmailPolling)
        .andTee(invalidations),
    disconnect: () => disconnectEmail().andTee(invalidations),
    invalidate: () => invalidateEmailLinks(),
    refetchInterval: emailRefetchInterval,
  };
}
