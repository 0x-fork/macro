import { openNangoConnectUI } from '@core/nango/connect-ui';
import { ThrownResultError, throwOnErr } from '@core/util/result';
import { queryClient } from '@queries/client';
import {
  cognitionApiServiceClient,
  NANGO_DISABLED,
} from '@service-cognition/client';
import type {
  AddServerRequest,
  ServerResponse,
  StartAuthRequest,
  UpdateServerRequest,
} from '@service-cognition/generated/schemas';
import { useMutation, useQuery } from '@tanstack/solid-query';

const KEYS = {
  all: ['mcpServers'] as const,
  list: ['mcpServers', 'list'] as const,
};

/** Stable placeholder for `neverSuspend` consumers (see below). */
const NO_SERVERS: ServerResponse[] = [];

export function useMcpServersQuery(options?: {
  /**
   * Poll for connection changes. OAuth finishes in another tab, and if this
   * one stayed visible no focus refetch fires — surfaces that must flip
   * promptly (the setup connector cards) pass a short interval.
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

function invalidateMcpServers() {
  return queryClient.invalidateQueries({ queryKey: KEYS.list });
}

function upsertServer(server: ServerResponse) {
  queryClient.setQueryData(
    KEYS.list,
    (current: ServerResponse[] | undefined) => {
      if (!current) return [server];
      const index = current.findIndex((s) => s.url === server.url);
      if (index === -1) return [...current, server];
      const next = [...current];
      next[index] = server;
      return next;
    }
  );
}

function removeServer(url: string) {
  queryClient.setQueryData(
    KEYS.list,
    (current: ServerResponse[] | undefined) =>
      current?.filter((s) => s.url !== url) ?? current
  );
}

export function useAddMcpServerMutation() {
  return useMutation(() => ({
    mutationFn: async (request: AddServerRequest) =>
      throwOnErr(
        async () => await cognitionApiServiceClient.addMcpServer(request)
      ),
    onSuccess: async (server: ServerResponse) => {
      upsertServer(server);
      await invalidateMcpServers();
    },
  }));
}

export function useUpdateMcpServerMutation() {
  return useMutation(() => ({
    mutationFn: async (request: UpdateServerRequest) =>
      throwOnErr(
        async () => await cognitionApiServiceClient.updateMcpServer(request)
      ),
    onSuccess: async (server: ServerResponse) => {
      upsertServer(server);
      await invalidateMcpServers();
    },
  }));
}

export function useDeleteMcpServerMutation() {
  return useMutation(() => ({
    mutationFn: async (args: { url: string }) =>
      throwOnErr(
        async () => await cognitionApiServiceClient.deleteMcpServer(args)
      ),
    onSuccess: async (_result: unknown, variables: { url: string }) => {
      removeServer(variables.url);
      await invalidateMcpServers();
    },
  }));
}

export function useStartMcpAuthMutation() {
  return useMutation(() => ({
    mutationFn: async (request: StartAuthRequest) =>
      throwOnErr(
        async () => await cognitionApiServiceClient.startMcpAuth(request)
      ),
  }));
}

export type NangoConnectOutcome = 'connected' | 'closed' | 'unsupported';

// Whether the backend has Nango configured, learned from the first session
// attempt (501 → unsupported). Cached so later connect clicks on a
// Nango-less deployment can take the legacy popup path synchronously, while
// the click's transient activation is still live.
let nangoUnsupported = false;

/** True once a connect attempt learned that this deployment has no Nango. */
export function isNangoKnownUnsupported(): boolean {
  return nangoUnsupported;
}

/**
 * Connect an MCP server through Nango's hosted Connect UI.
 *
 * Creates a Connect session (Nango owns OAuth discovery, dynamic client
 * registration, and token storage), opens the Connect UI in a fullscreen
 * iframe, and — once the user authorizes — registers the resulting
 * connection with our backend, which verifies ownership against Nango
 * before storing it.
 *
 * Resolves `'connected'` on success (server cache already refreshed),
 * `'closed'` when the user dismissed the UI without finishing, and
 * `'unsupported'` when the deployment has no Nango configured (callers
 * fall back to the legacy OAuth flow). Rejects on errors.
 */
export async function connectMcpServerViaNango(args: {
  /** Pre-fill the server URL so the Connect UI goes straight to OAuth. */
  serverUrl?: string;
  /** Display name stored on the new server row. */
  serverName?: string;
}): Promise<NangoConnectOutcome> {
  if (nangoUnsupported) return 'unsupported';

  const session = await cognitionApiServiceClient.createMcpNangoSession({
    server_url: args.serverUrl,
  });
  if (session.isErr()) {
    if (session.error.some((e) => e.code === NANGO_DISABLED)) {
      nangoUnsupported = true;
      return 'unsupported';
    }
    throw new ThrownResultError(session.error);
  }

  return await new Promise<NangoConnectOutcome>((resolve, reject) => {
    let settled = false;
    const ui = openNangoConnectUI({
      sessionToken: session.value.session_token,
      onEvent: (event) => {
        if (event.type === 'connect' && !settled) {
          settled = true;
          void (async () => {
            try {
              const server = await throwOnErr(
                async () =>
                  await cognitionApiServiceClient.completeMcpNangoSession({
                    connection_id: event.payload.connectionId,
                    server_name: args.serverName,
                  })
              );
              upsertServer(server);
              await invalidateMcpServers();
              resolve('connected');
            } catch (error) {
              reject(
                error instanceof Error
                  ? error
                  : new Error('failed to register Nango connection')
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
