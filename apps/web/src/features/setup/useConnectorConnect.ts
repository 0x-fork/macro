import type { FeaturedMcpServer } from '@core/component/AI/constant/mcpServers';
import { toast } from '@core/component/Toast/Toast';
import {
  connectMcpServerViaNango,
  isNangoKnownUnsupported,
  useAddMcpServerMutation,
  useStartMcpAuthMutation,
} from '@queries/mcp-servers';
import type { StartAuthResponse } from '@service-cognition/generated/schemas';
import { type Accessor, createSignal } from 'solid-js';

/**
 * The connect-a-tool workflow used by onboarding's connector steps.
 *
 * Servers that Nango can authorize go through the hosted Connect UI (a
 * fullscreen iframe — no popup-blocker concerns); everything else takes the
 * legacy path: add the MCP server if needed, then run OAuth in a popup. The
 * legacy popup opens synchronously, while the click's transient activation
 * is still live — opening after the awaited mutations gets rejected by
 * strict popup blockers. The OAuth URL is assigned once it's known;
 * severing `opener` keeps the provider page from reaching back into the app
 * (reverse tabnabbing).
 *
 * Completion is observed, not returned: the server reconciles the moment
 * OAuth completes, and the caller's polled servers query flips the state.
 */
export function createConnectorConnect(options: {
  server: FeaturedMcpServer;
  connected: Accessor<boolean>;
  authenticated: Accessor<boolean>;
}) {
  const addMutation = useAddMcpServerMutation();
  const authMutation = useStartMcpAuthMutation();
  const [busy, setBusy] = createSignal(false);

  const legacyConnect = async () => {
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      if (!options.connected()) {
        await addMutation.mutateAsync({
          server_name: options.server.server_name,
          url: options.server.url,
        });
      }
      const result: StartAuthResponse = await authMutation.mutateAsync({
        server_name: options.server.server_name,
        server_url: options.server.url,
      });
      if (popup) {
        popup.location.href = result.authorization_url;
      } else {
        // Popup was blocked outright — fall back to a plain open (may
        // still be blocked, but nothing else to try).
        window.open(result.authorization_url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      popup?.close();
      throw error;
    }
  };

  const connect = async () => {
    if (options.authenticated() || busy()) return;
    setBusy(true);
    const wantsNango =
      options.server.supportsNango !== false && !isNangoKnownUnsupported();
    try {
      if (wantsNango) {
        const outcome = await connectMcpServerViaNango({
          serverUrl: options.server.url,
          serverName: options.server.server_name,
        });
        if (outcome !== 'unsupported') return;
        // First click on a Nango-less deployment: transient activation was
        // spent on the session probe, so the popup may be blocked; the
        // plain-open fallback inside legacyConnect still gives it a shot.
      }
      await legacyConnect();
    } catch {
      toast.failure(`Failed to connect ${options.server.server_name}`);
    } finally {
      setBusy(false);
    }
  };

  return { connect, busy };
}
