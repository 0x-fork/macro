import { updateUserAuth } from '@core/auth';
import {
  authenticateWithEmailPermissions,
  type TimeoutError,
} from '@core/auth/channel';
import { openEmailAuthPopup } from '@core/auth/email';
import { queryKeys } from '@macro-entity';
import {
  disableSync,
  initUser,
  listLinks,
} from '@queries';
import { updateUserInfo } from '@service-gql/client';
import { useQuery } from '@tanstack/solid-query';
import { err, okAsync, Result, ResultAsync } from 'neverthrow';
import { createSignal } from 'solid-js';
import { queryClient } from '../../macro-entity/src/queries/client';

export const [emailRefetchInterval, setEmailRefetchInterval] = createSignal<
  number | undefined
>();

const EMAIL_LINKS_QUERY_KEY = ['email-links'];

async function fetchEmailLinks() {
  const { data, error } = await listLinks();
  if (error || !data) {
    throw new Error('Failed to fetch email links', { cause: error });
  }
  return (data as any)?.links ?? [];
}

export function useEmailLinksQuery() {
  return useQuery(() => ({
    queryKey: EMAIL_LINKS_QUERY_KEY,
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
  queryClient.invalidateQueries({
    queryKey: EMAIL_LINKS_QUERY_KEY,
  });
  queryClient.cancelQueries({ queryKey: queryKeys.all.email });
  queryClient.setQueriesData({ queryKey: queryKeys.all.email }, () => ({
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
async function initEmailLink(): Promise<Result<void, EmailInitError>> {
  const { error } = await initUser();

  if (error) {
    // Check if it's a 400 error (already initialized) by checking the error message
    const isBadRequest =
      error.message?.includes('400') || error.message?.includes('already');
    return err(
      isBadRequest
        ? { tag: 'AlreadyInitialized' as const }
        : {
            tag: 'FailedToInitialize' as const,
            message: error.message || 'Failed to initialize',
          }
    );
  }

  return okAsync(undefined);
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
