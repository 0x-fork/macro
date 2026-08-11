import { openPipedreamConnectUI } from '@core/pipedream/connect-ui';
import { ThrownResultError, throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import {
  type CatalogResponse,
  cognitionApiServiceClient,
  type McpServerResponse,
  type McpUpdateServerRequest,
  PIPEDREAM_DISABLED,
} from '@service-cognition/client';
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from '@tanstack/solid-query';

const KEYS = {
  all: ['mcpServers'] as const,
  list: ['mcpServers', 'list'] as const,
  catalog: (search: string) => ['mcpServers', 'catalog', search] as const,
};

/** Stable placeholder for `neverSuspend` consumers (see below). */
const NO_SERVERS: McpServerResponse[] = [];

export function useMcpServersQuery(options?: {
  /**
   * Poll for connection changes. Connecting finishes in the Connect UI
   * iframe, but other tabs never get a focus refetch — surfaces that must
   * flip promptly (the setup connector cards) pass a short interval.
   */
  refetchInterval?: number;
  /**
   * Serve an empty placeholder instead of suspending on first load. Only
   * for polling surfaces with their own Suspense boundary (the setup
   * connector cards), where a query that has never succeeded would
   * re-suspend on every scheduled refetch and blank the page rhythmically.
   * Everything else keeps suspending — with the placeholder they would
   * flash a fake "nothing connected" success state on first load.
   */
  neverSuspend?: boolean;
}) {
  return useQuery(() => ({
    queryKey: KEYS.list,
    queryFn: async () =>
      throwOnErr(async () => await cognitionApiServiceClient.listMcpServers()),
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: 'always' as const,
    refetchInterval: options?.refetchInterval,
    placeholderData: options?.neverSuspend ? NO_SERVERS : undefined,
  }));
}

/**
 * Browse or search the catalog of connectable MCP apps, paged by cursor.
 * Curated priority connectors arrive first (flagged `priority`), followed by
 * organic results from Pipedream's app directory.
 */
export function useMcpCatalogQuery(search: () => string) {
  return useInfiniteQuery(() => ({
    queryKey: KEYS.catalog(search().trim()),
    queryFn: async ({ pageParam }: { pageParam: string | undefined }) =>
      throwOnErr(
        async () =>
          await cognitionApiServiceClient.browseMcpCatalog({
            search: search().trim() || undefined,
            cursor: pageParam,
          })
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: CatalogResponse) =>
      lastPage.next_cursor ?? undefined,
    staleTime: 5 * 60 * 1000,
    // Serve the previous search's results (or nothing) instead of
    // suspending: first load must not block the settings page on the
    // directory, and keystrokes must not blank the list while refetching.
    placeholderData: (
      previous: InfiniteData<CatalogResponse, string | undefined> | undefined
    ) => previous ?? { pages: [], pageParams: [] },
  }));
}

function invalidateMcpServers() {
  return queryClient.invalidateQueries({ queryKey: KEYS.list });
}

function upsertServer(server: McpServerResponse) {
  queryClient.setQueryData(
    KEYS.list,
    (current: McpServerResponse[] | undefined) => {
      if (!current) return [server];
      const index = current.findIndex((s) => s.app_slug === server.app_slug);
      if (index === -1) return [...current, server];
      const next = [...current];
      next[index] = server;
      return next;
    }
  );
}

function removeServer(appSlug: string) {
  queryClient.setQueryData(
    KEYS.list,
    (current: McpServerResponse[] | undefined) =>
      current?.filter((s) => s.app_slug !== appSlug) ?? current
  );
}

export function useUpdateMcpServerMutation() {
  return useMutation(() => ({
    mutationFn: async (request: McpUpdateServerRequest) =>
      throwOnErr(
        async () => await cognitionApiServiceClient.updateMcpServer(request)
      ),
    onSuccess: async (server: McpServerResponse) => {
      upsertServer(server);
      await invalidateMcpServers();
    },
  }));
}

export function useDeleteMcpServerMutation() {
  return useMutation(() => ({
    mutationFn: async (args: { app_slug: string }) =>
      throwOnErr(
        async () => await cognitionApiServiceClient.deleteMcpServer(args)
      ),
    onSuccess: async (_result: unknown, variables: { app_slug: string }) => {
      removeServer(variables.app_slug);
      await invalidateMcpServers();
    },
  }));
}

export type PipedreamConnectOutcome = 'connected' | 'closed' | 'unsupported';

// Whether the backend has Pipedream configured, learned from the first token
// attempt (501 → unsupported). Cached so later connect clicks on an
// unconfigured deployment fail fast instead of re-probing.
let pipedreamUnsupported = false;

/**
 * Connect an MCP app through Pipedream's hosted Connect UI — the single
 * connect path for MCP connectors.
 *
 * Mints a Connect token (Pipedream owns the consent flow, credential
 * storage, and refresh), opens the hosted Connect UI in a fullscreen
 * iframe, and — once the user authorizes — registers the resulting account
 * with our backend, which verifies ownership against Pipedream before
 * storing it.
 *
 * Resolves `'connected'` on success (server cache already refreshed),
 * `'closed'` when the user dismissed the UI without finishing, and
 * `'unsupported'` when the deployment has no Pipedream configured (the
 * connect surface should say connectors are unavailable). Rejects on errors.
 */
export async function connectMcpApp(args: {
  /** The Pipedream app to connect, by name slug (e.g. `linear`). */
  appSlug: string;
  /** Display name stored on the connector row. */
  serverName?: string;
}): Promise<PipedreamConnectOutcome> {
  if (pipedreamUnsupported) return 'unsupported';

  const token = await cognitionApiServiceClient.createMcpPipedreamToken();
  if (token.isErr()) {
    if (token.error.some((e) => e.code === PIPEDREAM_DISABLED)) {
      pipedreamUnsupported = true;
      return 'unsupported';
    }
    throw new ThrownResultError(token.error);
  }

  return await new Promise<PipedreamConnectOutcome>((resolve, reject) => {
    let settled = false;
    const ui = openPipedreamConnectUI({
      token: token.value.token,
      app: args.appSlug,
      onEvent: (event) => {
        if (event.type === 'success' && !settled) {
          settled = true;
          void (async () => {
            try {
              const server = await throwOnErr(
                async () =>
                  await cognitionApiServiceClient.completeMcpPipedreamConnection(
                    {
                      account_id: event.accountId,
                      server_name: args.serverName,
                    }
                  )
              );
              upsertServer(server);
              await invalidateMcpServers();
              resolve('connected');
            } catch (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error('failed to register Pipedream connection')
              );
            } finally {
              ui.close();
            }
          })();
        } else if (event.type === 'close' && !settled) {
          settled = true;
          resolve('closed');
        }
        // 'error' events are shown inside the Connect UI itself; the user
        // can retry there or close, so they don't settle the promise.
      },
    });
  });
}
