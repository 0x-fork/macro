# mcp_client

MCP connector integration: users connect the apps their team uses (Linear,
Notion, Slack, GitHub, …) and the AI agent calls those apps' tools. Hosted
by `document_cognition_service`, which mounts the `/mcp/servers*` routes and
builds per-request toolsets from the user's connected apps.

## Pipedream: the single connect path

[Pipedream Connect](https://pipedream.com/docs/connect) owns the entire
account lifecycle: the consent flow (hosted Connect UI), OAuth apps for
~2,500 providers (no per-provider OAuth app registration on our side),
credential storage, and token refresh. Tool calls go through Pipedream's
remote MCP server, which injects each account's credentials server-side —
no tokens ever transit or persist in our systems. We store only the app
slug and the Pipedream connected-account ID per user.

There is deliberately **no fallback auth path**: no in-house OAuth, no
per-provider client IDs. A deployment without Pipedream credentials answers
501 on the connect/catalog endpoints and builds empty MCP toolsets.

Flow:

1. Frontend `POST /mcp/servers/pipedream/token` → short-lived Connect token
   minted for the user.
2. Frontend opens Pipedream's hosted Connect UI (iframe) for the chosen app;
   the user authorizes; the UI reports a connected-account ID.
3. Frontend `POST /mcp/servers/pipedream/complete` with the account ID. The
   backend verifies with Pipedream that the account exists and was connected
   for this user, then upserts the `mcp_servers` row and fires the
   auth-completed hook (imports start immediately).

Tool calls: `McpToolSet` connects to `remote.mcp.pipedream.net` per enabled
app with the project's OAuth access token (client-credentials grant, cached)
plus `x-pd-project-id` / `x-pd-environment` / `x-pd-external-user-id` /
`x-pd-app-slug` headers and `x-pd-tool-mode: tools-only`.

## Connector catalog

`GET /mcp/servers/catalog` advertises what users can connect: a curated
list of priority connectors (pinned first, flagged `priority` so clients
can show them as a featured section) merged with search results from
Pipedream's app directory. To promote a connector, add it to
`PRIORITY_CONNECTORS` in `domain/service/catalog.rs`.

## Setup (per environment)

1. Create a Pipedream Connect project (pipedream.com), one per deploy
   environment (its `development`/`production` split maps to ours).
2. Add to doppler for `document_cognition_service`: `PIPEDREAM_CLIENT_ID`,
   `PIPEDREAM_CLIENT_SECRET` (project OAuth client), and
   `PIPEDREAM_PROJECT_ID` (`proj_...`).
3. Optional: `PIPEDREAM_ENVIRONMENT` (defaults to `production` in prd,
   `development` elsewhere), `PIPEDREAM_API_URL`, `PIPEDREAM_MCP_URL`.

## Key pieces

- `domain/service/toolset.rs` — `McpToolSet` / `CombinedToolSet`: connect
  to the user's enabled apps, mangle tool names as `mcp__<name>__<tool>`,
  dispatch calls.
- `domain/service/pipedream_connect.rs` — connection-completion policy
  (ownership verification) and disconnect.
- `domain/service/catalog.rs` — the catalog merge and the curated priority
  list.
- `outbound/pipedream.rs` — the Pipedream REST + remote MCP adapter.
- `inbound/axum_router.rs` — the `/mcp/servers*` HTTP surface.
