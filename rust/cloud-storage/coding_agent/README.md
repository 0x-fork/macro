# coding_agent

A provider-agnostic contract for orchestrating **cloud coding agents** from
Macro, plus the first implementation (Cursor) and the AI tools that let the
Macro agent drive it.

The goal: let the Macro agent **spawn** a coding agent on a repo, **orchestrate**
it (follow up / stop), and **subscribe** to its status — without coupling Macro
to any single vendor. Adding a second backend (Devin, GitHub Copilot coding
agent, an in-house runner, …) is a single new `impl` — every caller keeps
working because they only ever see the normalized models.

## Layout (hexagonal)

```
domain/            # the vendor-neutral contract (always compiled)
  models.rs        #   normalized types: LaunchAgentRequest, CodingAgent,
                   #   CodingAgentStatus, CodingAgentEvent, ProviderCapabilities, …
  ports.rs         #   the CodingAgentProvider trait + WebhookHeaders
outbound/          # adapters that implement the contract  (feature = "outbound")
  cursor.rs        #   CursorAgentProvider — Cursor Cloud Agents REST API + webhook verify
inbound/           # adapters that drive the contract       (feature = "inbound")
  toolset/         #   AI tools: SpawnCodingAgent, GetCodingAgentStatus,
                   #   FollowUpCodingAgent, StopCodingAgent + CodingAgentToolContext
```

## The contract

`domain::ports::CodingAgentProvider` (used as `Arc<dyn CodingAgentProvider>`):

| method | purpose |
| --- | --- |
| `kind` / `capabilities` | identify the backend and what it supports |
| `launch` | start a run, returns a `CodingAgent` snapshot |
| `get` | fetch current status (the polling primitive) |
| `follow_up` / `stop` / `delete` | orchestration (optional; default `Unsupported`) |
| `conversation` | transcript (optional) |
| `verify_and_parse_webhook` | verify a signed status webhook → normalized `CodingAgentEvent` |

## Adding a provider

1. Add a variant to `CodingAgentProviderKind`.
2. Add an adapter under `outbound/` implementing `CodingAgentProvider`,
   mapping the vendor's wire format to/from `domain::models`.
3. Advertise real support via `capabilities()`; leave unsupported ops as the
   default `Unsupported`.

Nothing else changes — the AI tools and any webhook receiver are written
against the trait.

## Wiring into Macro (done)

- `ai_tools` depends on this crate and registers `coding_agent_toolset()` in
  `all_tools()` / `mcp_tools()`.
- `ToolServiceContext` carries a `CodingAgentToolContext`, built by
  `ai_tools::build_coding_agent_tool_context()` from env:
  - `CURSOR_API_KEY` — Cursor API key (optional; tools return a clear
    "not configured" error when absent).
  - `CODING_AGENT_WEBHOOK_URL` + `CODING_AGENT_WEBHOOK_SECRET` — when both set,
    spawned agents are launched with a status-change webhook.

With just `CURSOR_API_KEY`, the Macro agent can already spawn an agent and
**subscribe by polling** `GetCodingAgentStatus` within a conversation. With the
webhook env vars set as well, completion is **pushed** (see below).

## Push-based subscription (implemented)

Cursor only fires webhooks on terminal states (`FINISHED` / `ERROR`), so
`capabilities().requires_status_polling` is `true`; intermediate progress is
polled. Terminal completion is delivered without polling:

- **Stateless routing.** When the spawn tool launches an agent it points the
  webhook at `{CODING_AGENT_WEBHOOK_URL}/{token}`, where `token` is a
  [`sign_route_token`](src/inbound/routing.rs) HMAC over the spawning user (and,
  in future, chat). No `agent → owner` table is needed.
- **Receiver.** [`inbound::webhook::process_webhook`](src/inbound/webhook.rs) is
  framework-agnostic: it verifies the provider body signature
  (`verify_and_parse_webhook`) and the routing token, then hands a
  `RoutedCodingAgentEvent` to a [`CodingAgentEventSink`](src/domain/ports.rs).
- **Hosting service.** `document_cognition_service` mounts the route at
  `/webhooks/coding-agent/{token}` (outside the auth layer) and implements a
  sink that pushes a `coding_agent_status` realtime message to the user (and
  chat) over the connection gateway. See
  `document_cognition_service/src/api/coding_agent_webhook.rs`.

### Remaining polish

1. **Frontend realtime listener.** The four tool *renderers* exist; surfacing
   the async `coding_agent_status` push (e.g. a toast / inbox entry when an
   agent finishes) needs a client handler for that message type, or routing the
   event through the full notification system instead of a raw realtime push.
2. **Chat-scoped routing.** `RouteTarget` already carries an optional
   `chat_id`; the spawn tool sets only `user_id` today because the narrow tool
   context can't yet see the originating chat. Threading
   `usage_context.entity` (the chat UUID) into `CodingAgentToolContext` via a
   custom `FromRef` would let completion land in the exact conversation.
3. **Progress polling.** Optionally have the `scheduled_action` service call
   `get` for non-terminal agents to surface mid-run progress.
4. **Infra.** Provision a `cursor-api-key-${stack}` secret and add
   `CURSOR_API_KEY` (+ webhook URL/secret) to `infra/.../ai_tools.ts`,
   following the existing `GITHUB_CLIENT_SECRET` pattern.
