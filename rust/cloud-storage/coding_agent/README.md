# coding_agent

A provider-agnostic contract for orchestrating **cloud coding agents** from
Macro, with two implementations — **Cursor Cloud Agents** and **Anthropic
Claude Managed Agents** — and the AI tools that let the Macro agent drive them.

The goal: let the Macro agent **spawn** a coding agent on a repo, **orchestrate**
it (follow up / stop), and **subscribe** to its status — without coupling Macro
to any single vendor. Adding another backend (Devin, GitHub Copilot coding
agent, an in-house runner, …) is a single new `impl` — every caller keeps
working because they only ever see the normalized models.

## Layout (hexagonal)

```
domain/            # the vendor-neutral contract (always compiled)
  models.rs        #   normalized types: LaunchAgentRequest, CodingAgent,
                   #   CodingAgentStatus, CodingAgentEvent, AgentCorrelation, …
  ports.rs         #   CodingAgentProvider + CodingAgentEventSink + WebhookHeaders
outbound/          # provider adapters                       (feature = "outbound")
  cursor.rs        #   Cursor Cloud Agents
  claude.rs        #   Claude Managed Agents (beta)
inbound/           # adapters that drive the contract (always compiled)
  routing.rs       #   stateless signed routing tokens
  webhook.rs       #   framework-agnostic webhook receiver (process_webhook)
  toolset/         #   AI tools + provider registry          (feature = "toolset")
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
| `verify_and_parse_webhook(headers, body, url_token)` | authenticate a delivery → normalized `CodingAgentEvent` (with recovered `correlation`) |

Key normalized concepts:

- **`AgentCorrelation`** (`{ user_id, chat_id }`) is attached to
  `LaunchAgentRequest.correlation` and round-tripped by the provider so status
  events route back to the originating user/conversation — no server-side
  `agent → owner` table. Each provider chooses the mechanism (Cursor: a signed
  routing token in the webhook URL; Claude: session metadata).
- **`CodingAgentStatus`** includes a non-terminal `AwaitingInput` for
  long-running sessions that idle waiting for the next instruction.
- **`provider_options`** on the launch request is an escape hatch for
  provider-specific knobs (e.g. Claude `agent_id` / `environment_id`).
- The provider owns its webhook secret, so `verify_and_parse_webhook` doesn't
  take one.

## Providers

- **Cursor** (`outbound::cursor`) — Cursor Cloud Agents REST API
  (`/v0/agents`, Bearer auth). Webhooks fire on terminal states only, so
  `requires_status_polling` is `true`. Correlation travels in the signed URL
  token.
- **Claude** (`outbound::claude`) — Claude Managed Agents (sessions on a
  pre-configured agent + environment, `x-api-key`, beta header
  `managed-agents-2026-04-01`). Lifecycle webhooks cover idle/terminated, so
  polling is optional. Correlation travels in session metadata.
  ⚠️ **Beta:** the exact endpoint paths / payload fields are isolated as
  constants/structs in `claude.rs` and reflect the documented session model;
  verify them against the live beta docs before production.

### Adding a provider

1. Add a variant to `CodingAgentProviderKind` (+ `as_str` / `from_str`).
2. Add an adapter under `outbound/` implementing `CodingAgentProvider`.
3. Advertise real support via `capabilities()`; leave unsupported ops default.
4. Register it in `ai_tools::build_coding_agent_tool_context` and add a
   `ProviderSelector` variant for the AI to pick it.

## Wiring into Macro (done)

- `ai_tools::build_coding_agent_tool_context()` builds a **registry** of
  providers (`HashMap<CodingAgentProviderKind, Arc<dyn CodingAgentProvider>>`)
  with Cursor as the default, and the AI selects per call via the tools'
  optional `provider` field (`"cursor"` | `"claude"`).
- Registered in `all_tools()` / `mcp_tools()`; surfaced on `ToolServiceContext`.
- Env vars:
  - Cursor: `CURSOR_API_KEY`, `CODING_AGENT_WEBHOOK_URL`,
    `CODING_AGENT_WEBHOOK_SECRET`.
  - Claude: `ANTHROPIC_API_KEY`, `CLAUDE_MANAGED_AGENT_ID`,
    `CLAUDE_MANAGED_ENVIRONMENT_ID`, `CLAUDE_MANAGED_WEBHOOK_SECRET`.
  - All optional: a provider that isn't configured returns a clear error when
    used, rather than breaking the whole context.

## Push-based subscription

`document_cognition_service` mounts the receiver outside the auth layer at:

- `/webhooks/coding-agent/{provider}` — correlation in the body (Claude).
- `/webhooks/coding-agent/{provider}/{token}` — correlation in the signed token
  (Cursor).

The handler resolves the provider from the registry, calls `process_webhook`
(which authenticates the delivery and recovers the correlation), and pushes a
`coding_agent_status` realtime message to the spawning user (and chat) over the
connection gateway. See `document_cognition_service/src/api/coding_agent_webhook.rs`.

### Remaining polish

1. **Frontend realtime listener.** The four tool *renderers* exist; surfacing
   the async `coding_agent_status` push (a toast / inbox entry when an agent
   finishes) needs a client handler for that message type, or routing the event
   through the full notification system.
2. **Chat-scoped routing.** `AgentCorrelation` carries an optional `chat_id`;
   the spawn tool sets only `user_id` today because the narrow tool context
   can't yet see the originating chat. Threading `usage_context.entity` (the
   chat UUID) into `CodingAgentToolContext` via a custom `FromRef` would land
   completion in the exact conversation.
3. **Claude API verification.** Confirm the Managed Agents session/event/webhook
   wire format against the live beta docs and adjust the constants in
   `claude.rs`.
4. **Infra.** Provision the provider secrets (`cursor-api-key-${stack}`, the
   Claude managed-agent ids + webhook secret) and add the env vars to
   `infra/.../ai_tools.ts`, following the existing `GITHUB_CLIENT_SECRET` pattern.
