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
**subscribe by polling** `GetCodingAgentStatus` within a conversation.

## Remaining: push-based subscription

Cursor only fires webhooks on terminal states (`FINISHED` / `ERROR`), so
`capabilities().requires_status_polling` is `true`. To deliver push updates
into a Macro thread, the following layer is still needed (the verification +
event normalization it relies on already lives in `verify_and_parse_webhook`):

1. An Axum webhook route (e.g. in `document_cognition_service`) that adapts its
   `HeaderMap` to `WebhookHeaders`, calls `verify_and_parse_webhook` over the
   **raw** body, and dispatches the resulting `CodingAgentEvent`.
2. An `agent_id → {user, thread}` mapping (a Postgres table) so an event can be
   routed back to the conversation that spawned it.
3. A push via the connection gateway (`ConnectionGatewayClient`) +/- a
   notification, mirroring how other features surface updates.
4. Optional: a poller (the `scheduled_action` service) calling `get` for
   non-terminal agents to surface intermediate progress.
