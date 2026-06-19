# coding_agent

Integration for orchestrating **Anthropic Claude Managed Agents** from Macro,
behind a small vendor-neutral contract so additional backends can be added later
without touching the callers.

The Macro agent can **spawn** a coding agent on a GitHub repo, **orchestrate**
it (follow up / stop), and **subscribe** to its status. Today there's a single
backend — Claude Managed Agents — but the tools, webhook receiver, and domain
models all speak the generic [`CodingAgentProvider`](src/domain/ports.rs)
contract, so a future backend is just one more `impl`.

## Layout (hexagonal)

```
domain/            # the vendor-neutral contract (always compiled)
  models.rs        #   LaunchAgentRequest, CodingAgent, CodingAgentStatus,
                   #   CodingAgentEvent, AgentCorrelation, ProviderCapabilities, …
  ports.rs         #   CodingAgentProvider, CodingAgentEventSink,
                   #   GitTokenResolver, WebhookHeaders
outbound/          # provider adapters                       (feature = "outbound")
  claude.rs        #   Claude Managed Agents
inbound/           # adapters that drive the contract (always compiled)
  webhook.rs       #   framework-agnostic webhook receiver (process_webhook)
  toolset/         #   AI tools + context                    (feature = "toolset")
```

## The contract

`domain::ports::CodingAgentProvider` (used as `Arc<dyn CodingAgentProvider>`):

| method | purpose |
| --- | --- |
| `kind` / `capabilities` | identify the backend and what it supports |
| `launch` | start a run, returns a `CodingAgent` snapshot |
| `get` | fetch current status (polling primitive) |
| `follow_up` / `stop` / `delete` | orchestration (optional; default `Unsupported`) |
| `conversation` | transcript (optional) |
| `verify_and_parse_webhook(headers, body)` | authenticate a delivery → normalized `CodingAgentEvent` with recovered `correlation` |

Key normalized concepts:

- **`AgentCorrelation`** (`{ user_id, chat_id }`) rides on `LaunchAgentRequest`
  and is round-tripped by the provider (Claude stores it as session metadata)
  so completion events route back to the originating user/chat — no server-side
  `agent → owner` table.
- **`git_token`** on the launch request is the spawning user's GitHub token,
  used to clone the repo (see below).
- **`CodingAgentStatus`** includes a non-terminal `AwaitingInput` for sessions
  that idle waiting for the next instruction.
- **`provider_options`** is an escape hatch for backend-specific knobs
  (Claude `agent_id` / `environment_id`).

## How Claude gets the repository

Managed Agents don't take a `repository` field — the repo is **mounted as a
per-session resource** that the platform clones into the sandbox using a GitHub
token, and the agent opens PRs through the GitHub MCP server. So `launch`:

1. creates a session referencing the configured `agent` + `environment_id`,
2. attaches `resources: [{ type: "github_repository", url, mount_path: "/workspace/repo", authorization_token: <user token> }]`,
3. stashes the `AgentCorrelation` in session `metadata`,
4. sends the task as the first `user.message` event.

The **per-user GitHub token** comes from [`GitTokenResolver`](src/domain/ports.rs):
the spawn tool resolves it by `user_id` and sets `git_token`. This is the
multi-tenant seam — every user runs agents on *their own* repos with *their own*
credentials, under one Macro-owned Anthropic key.

See <https://platform.claude.com/docs/en/managed-agents/github>.

## Wiring into Macro (done)

- `ai_tools::build_coding_agent_tool_context()` builds the `ClaudeAgentProvider`
  from env and the tool context.
- Registered in `all_tools()` / `mcp_tools()`; surfaced on `ToolServiceContext`.
- `document_cognition_service` mounts the webhook receiver at
  `/webhooks/coding-agent` (outside auth) and pushes a `coding_agent_status`
  realtime message to the spawning user (and chat) over the connection gateway.
- Env vars (all optional; an unconfigured piece yields a clear error or the
  public-repo fallback):
  - `ANTHROPIC_API_KEY` — Claude API key.
  - `CLAUDE_MANAGED_AGENT_ID`, `CLAUDE_MANAGED_ENVIRONMENT_ID` — the pre-created
    agent (must declare the GitHub MCP server) and environment.
  - `CLAUDE_MANAGED_WEBHOOK_SECRET` — webhook signing secret (Console-registered).

## Remaining work

1. **Real `GitTokenResolver`.** `ai_tools` currently wires a `NoOpGitTokenResolver`
   (returns `None` → unauthenticated clone, **public repos only**). For private
   repos, implement it against Macro's `github` crate (look up the user's
   connected GitHub access token by `user_id` — needs FusionAuth + GitHub IdP
   wiring), or broker tokens via a Macro GitHub App.
2. **Agent setup.** The referenced Managed Agent must be created once with the
   GitHub MCP server + toolsets declared (out-of-band, in the Console / API).
3. **Claude beta verification.** Confirm the session/event/resource/webhook wire
   format against the live beta docs and adjust the constants in `claude.rs`.
4. **Frontend realtime listener.** The tool *renderers* exist; surfacing the
   async `coding_agent_status` push (a toast / inbox entry when an agent
   finishes) needs a client handler for that message type.
5. **Chat-scoped routing.** `AgentCorrelation` carries `chat_id`, but the spawn
   tool sets only `user_id`; thread `usage_context.entity` into the tool context
   to land completion in the exact conversation.
6. **Infra.** Provision the Claude secret(s) and add the env vars to
   `infra/.../ai_tools.ts`.
