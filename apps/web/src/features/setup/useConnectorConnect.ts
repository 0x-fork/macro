import type { FeaturedMcpServer } from '@core/component/AI/constant/mcpServers';
import { toast } from '@core/component/Toast/Toast';
import { connectMcpApp } from '@queries/mcp-servers';
import { type Accessor, createSignal } from 'solid-js';

/**
 * The connect-a-tool workflow used by onboarding's connector steps.
 *
 * Every connector goes through Pipedream's hosted Connect UI (a fullscreen
 * iframe — no popup-blocker concerns). Completion is observed, not
 * returned: the server reconciles the moment the connection registers, and
 * the caller's polled servers query flips the state.
 */
export function createConnectorConnect(options: {
  server: FeaturedMcpServer;
  connected: Accessor<boolean>;
}) {
  const [busy, setBusy] = createSignal(false);

  const connect = async () => {
    if (options.connected() || busy()) return;
    setBusy(true);
    try {
      const outcome = await connectMcpApp({
        appSlug: options.server.app_slug,
        serverName: options.server.server_name,
      });
      if (outcome === 'unsupported') {
        toast.failure('Connectors are not available on this deployment');
      }
    } catch {
      toast.failure(`Failed to connect ${options.server.server_name}`);
    } finally {
      setBusy(false);
    }
  };

  return { connect, busy };
}
