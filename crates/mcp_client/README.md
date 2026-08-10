# mcp_client

Outbound MCP integration: lets users connect third-party MCP servers
(Linear, Notion, PostHog, custom servers, …) whose tools the AI agent can
then call. Hosted by `document_cognition_service`, which mounts the
`/mcp/servers*` routes and builds per-request toolsets from the user's
connected servers.

## Authorization paths

There are two ways a server's OAuth grant can be managed. Records in
`mcp_servers` carry whichever the user connected with; both kinds work side
by side.

### Nango (preferred)

[Nango](https://nango.dev) owns the entire OAuth lifecycle: endpoint
discovery, dynamic client registration (DCR/CIMD), the consent flow (in
Nango's hosted Connect UI), token storage, and refresh. We store only the
`nango_connection_id` and fetch a fresh access token at connect time
(cached in-process, see `outbound/nango.rs`), presenting it as a plain
bearer. This works for **any** spec-compliant MCP server that supports
automatic client registration — users can connect arbitrary servers by URL.

Flow:

1. Frontend `POST /mcp/servers/nango/session` (optionally with a
   `server_url` to pre-fill) → short-lived Connect session token.
2. Frontend opens Nango's Connect UI (iframe) with that token; the user
   authorizes; the UI reports a `connectionId`.
3. Frontend `POST /mcp/servers/nango/complete` with the connection ID. The
   backend verifies with Nango that the connection exists and was created
   for this user, then upserts the `mcp_servers` row and fires the
   auth-completed hook (imports start immediately).

Setup (per environment):

1. In the Nango dashboard, create an integration of type **MCP Server
   OAuth2 (Generic)** with the ID `mcp-generic` (or set
   `NANGO_MCP_INTEGRATION_ID` to whatever ID you choose).
2. Add the environment's secret key to doppler as `NANGO_SECRET_KEY` for
   `document_cognition_service`.
3. Optional: `NANGO_API_URL` (defaults to `https://api.nango.dev`).

Without `NANGO_SECRET_KEY` the Nango endpoints answer 501 and the frontend
falls back to the legacy flow, so local dev works unconfigured.

### Legacy in-house OAuth

The original flow: this crate drives the PKCE handshake itself
(`outbound/oauth.rs`), stores AES-256-GCM-encrypted tokens in Postgres, and
refreshes them via `PersistingCredentialStore`. Still used for servers that
require a pre-registered OAuth client instead of DCR (GitHub Copilot MCP,
Slack — see `domain/provider_registry`) and for existing connections made
before Nango.

## Key pieces

- `domain/service/toolset.rs` — `McpToolSet` / `CombinedToolSet`: connect
  to the user's enabled servers, mangle tool names as
  `mcp__<server>__<tool>`, dispatch calls.
- `outbound/nango_resolving_store.rs` — store decorator that resolves
  fresh Nango tokens into records at load time, so toolset and import code
  don't know Nango exists.
- `domain/service/nango_connect.rs` — connection-completion policy
  (ownership verification) and server disconnect.
- `inbound/axum_router.rs` — the `/mcp/servers*` HTTP surface.
