//! Provider-agnostic domain models.
//!
//! The most important type here is [`CodingEvent`] — the wire-stable union of
//! everything a coding agent can report while it works. It is intentionally
//! modelled after the Agent Client Protocol (ACP) `session/update` payloads so
//! that an ACP agent maps onto it 1:1, but it is not ACP-specific: any backend
//! emits the same events and the frontend renders them the same way.

use serde::{Deserialize, Serialize};

/// A GitHub repository the coding agent will operate on.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoRef {
    /// The repository owner (user or organization login).
    pub owner: String,
    /// The repository name.
    pub name: String,
    /// The default branch to clone, if known (e.g. `main`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_branch: Option<String>,
}

impl RepoRef {
    /// `owner/name`.
    pub fn full_name(&self) -> String {
        format!("{}/{}", self.owner, self.name)
    }

    /// The HTTPS clone URL for this repository.
    pub fn clone_url(&self) -> String {
        format!("https://github.com/{}/{}.git", self.owner, self.name)
    }

    /// Parse an `owner/name` string into a [`RepoRef`].
    pub fn parse(full_name: &str) -> Option<Self> {
        let (owner, name) = full_name.split_once('/')?;
        if owner.is_empty() || name.is_empty() {
            return None;
        }
        Some(Self {
            owner: owner.to_string(),
            name: name.to_string(),
            default_branch: None,
        })
    }
}

/// Opaque identifier for a provisioned sandbox, assigned by the provider.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct SandboxId(pub String);

impl std::fmt::Display for SandboxId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Lifecycle status of a sandbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SandboxStatus {
    /// No sandbox exists yet for this chat.
    None,
    /// The sandbox is being created (clone + setup in progress).
    Provisioning,
    /// The sandbox is warm and ready to accept a task.
    Ready,
    /// The sandbox was idled/hibernated to save cost; warmable on demand.
    Sleeping,
    /// The sandbox was stopped (snapshot retained) and must be resumed.
    Stopped,
    /// The sandbox failed to provision or crashed.
    Error,
}

/// Credentials injected into the sandbox so git can clone, push and open PRs.
#[derive(Clone)]
pub struct GitCredentials {
    /// The git username (for GitHub a constant like `x-access-token` works
    /// with token auth).
    pub username: String,
    /// The access token (OAuth user token or installation token).
    pub token: String,
}

impl std::fmt::Debug for GitCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Never leak the token in logs.
        f.debug_struct("GitCredentials")
            .field("username", &self.username)
            .field("token", &"<redacted>")
            .finish()
    }
}

/// Knobs for provisioning a sandbox.
#[derive(Debug, Clone)]
pub struct SandboxOptions {
    /// Outbound network policy applied to the sandbox.
    pub network: NetworkPolicy,
    /// Optional provider snapshot/image to start from (warm start).
    pub snapshot: Option<String>,
}

impl Default for SandboxOptions {
    fn default() -> Self {
        Self {
            network: NetworkPolicy::Allowlist(vec![
                "github.com".to_string(),
                "api.github.com".to_string(),
                "api.anthropic.com".to_string(),
            ]),
            snapshot: None,
        }
    }
}

/// Outbound network policy for a sandbox (mirrors Claude Code's web policy).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NetworkPolicy {
    /// No outbound network access.
    None,
    /// Only the listed hostnames are reachable.
    Allowlist(Vec<String>),
    /// Unrestricted outbound access.
    Full,
}

/// A task handed to a coding agent.
#[derive(Debug, Clone)]
pub struct CodingTask {
    /// The natural-language instruction for the agent.
    pub prompt: String,
    /// The branch to base work on (defaults to the repo default branch).
    pub base_branch: Option<String>,
    /// The branch the agent should create and push.
    pub work_branch: String,
}

/// How permission requests from the agent are resolved.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionPolicy {
    /// Approve every request automatically (suitable for an isolated sandbox).
    AutoApprove,
    /// Approve read-only/safe operations, reject destructive ones.
    AutoApproveSafe,
    /// Reject everything (dry run).
    RejectAll,
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self::AutoApproveSafe
    }
}

/// A handle the [`AgentRunner`](crate::domain::ports::AgentRunner) uses to talk
/// to the agent process inside a provisioned sandbox.
#[derive(Debug, Clone)]
pub struct SandboxConnection {
    /// The sandbox this connection belongs to.
    pub sandbox_id: SandboxId,
    /// A `wss://`/`ws://` URL that bridges to the agent process's stdio inside
    /// the sandbox (e.g. a Daytona session/PTY socket or a preview URL).
    pub agent_socket_url: String,
    /// The absolute path of the cloned repository inside the sandbox.
    pub workdir: String,
}

/// A freshly provisioned sandbox.
#[derive(Debug, Clone)]
pub struct ProvisionedSandbox {
    /// The sandbox identifier.
    pub id: SandboxId,
    /// The connection used to drive the agent.
    pub connection: SandboxConnection,
}

/// The kind of operation a tool call performs (drives the icon on the
/// frontend). Mirrors ACP `ToolKind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolKind {
    /// Reading a file or resource.
    Read,
    /// Editing/creating a file.
    Edit,
    /// Deleting a file.
    Delete,
    /// Moving/renaming a file.
    Move,
    /// Searching the codebase.
    Search,
    /// Executing a command.
    Execute,
    /// Reasoning/thinking.
    Think,
    /// Fetching a remote resource.
    Fetch,
    /// Anything else.
    Other,
}

/// Lifecycle of a tool call. Mirrors ACP tool-call statuses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallStatus {
    /// The call was issued but has not started executing.
    Pending,
    /// The call is executing.
    InProgress,
    /// The call finished successfully.
    Completed,
    /// The call failed.
    Failed,
}

/// Status of a single plan entry. Mirrors ACP plan entry status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    /// Not started.
    Pending,
    /// In progress.
    InProgress,
    /// Completed.
    Completed,
}

/// A single item in the agent's plan/todo list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlanEntry {
    /// Human-readable description of the step.
    pub content: String,
    /// Current status of the step.
    pub status: PlanStatus,
}

/// An option offered with a permission request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionOption {
    /// Stable identifier for the option (sent back when chosen).
    pub id: String,
    /// Human-readable label (e.g. "Allow", "Allow always", "Reject").
    pub label: String,
    /// Whether choosing this option permits the operation.
    pub allows: bool,
}

/// The decision made for a permission request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionDecision {
    /// The request being answered.
    pub request_id: String,
    /// The chosen option id.
    pub option_id: String,
}

/// Why a coding turn ended. Mirrors ACP stop reasons.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopReason {
    /// The agent completed the turn normally.
    EndTurn,
    /// The agent hit the max token budget.
    MaxTokens,
    /// The agent hit the max number of tool-call rounds.
    MaxTurnRequests,
    /// The agent refused the task.
    Refusal,
    /// The turn was cancelled.
    Cancelled,
}

/// The result of opening a pull request.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PrResult {
    /// The PR html URL.
    pub url: String,
    /// The PR number.
    pub number: u64,
    /// The head branch that was pushed.
    pub branch: String,
    /// The PR title.
    pub title: String,
    /// Number of files changed, if known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changed_files: Option<u64>,
}

/// The provider/agent-agnostic event stream produced while the agent works.
///
/// This is the rendering contract between the backend and the frontend. It is
/// embedded verbatim (as JSON) inside the chat message stream so the existing
/// chat UI can render each event live.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CodingEvent {
    /// The session was created; the sandbox is ready and work has begun.
    SessionStarted {
        /// The sandbox backing this session.
        sandbox_id: String,
        /// The repository being worked on (`owner/name`).
        repo: String,
        /// The working branch the agent will push.
        branch: String,
    },
    /// A chunk of assistant-visible prose from the coding agent.
    Message {
        /// The text content.
        text: String,
    },
    /// A chunk of the agent's private reasoning.
    Thought {
        /// The reasoning text.
        text: String,
    },
    /// The agent started a tool call.
    ToolCall {
        /// Stable id for this tool call (matches a later [`Self::ToolUpdate`]).
        id: String,
        /// A short human-readable title (e.g. "Edit src/main.rs").
        title: String,
        /// What kind of operation this is.
        kind: ToolKind,
        /// Current status.
        status: ToolCallStatus,
    },
    /// A status/content update to an in-flight tool call.
    ToolUpdate {
        /// The tool call being updated.
        id: String,
        /// The new status.
        status: ToolCallStatus,
        /// Optional textual output (stdout, result snippet).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        output: Option<String>,
    },
    /// A file diff the agent produced.
    Diff {
        /// Path of the changed file, relative to the repo root.
        path: String,
        /// Previous contents (absent for new files).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        old_text: Option<String>,
        /// New contents.
        new_text: String,
    },
    /// The agent's current plan/todo list (sent whenever it changes).
    Plan {
        /// The ordered plan entries.
        entries: Vec<PlanEntry>,
    },
    /// The agent is asking permission to perform an operation.
    PermissionRequest {
        /// Stable id for this request.
        id: String,
        /// Human-readable description of what is being requested.
        title: String,
        /// The options the user (or policy) can choose from.
        options: Vec<PermissionOption>,
    },
    /// How a permission request was resolved (by the user or a policy).
    PermissionResolved {
        /// The request that was resolved.
        id: String,
        /// The option id that was chosen.
        option_id: String,
    },
    /// A diagnostic/log line.
    Log {
        /// Severity (e.g. "info", "warn", "error").
        level: String,
        /// The message.
        message: String,
    },
    /// The coding turn finished.
    Finished {
        /// Why the turn ended.
        stop_reason: StopReason,
        /// The pull request that was opened, if any.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        pr: Option<PrResult>,
        /// A short natural-language summary of what was done.
        summary: String,
    },
    /// A fatal error ended the session.
    Error {
        /// The error message.
        message: String,
    },
}

/// The terminal result of a delegated coding turn (returned to the main agent
/// as the tool response).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CodingOutcome {
    /// Why the turn ended.
    pub stop_reason: StopReason,
    /// The pull request that was opened, if any.
    pub pr: Option<PrResult>,
    /// A short natural-language summary of what was done.
    pub summary: String,
}

/// Persisted mapping of a chat to its sandbox + selected repository.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SandboxRecord {
    /// The chat this sandbox belongs to.
    pub chat_id: String,
    /// The owner of the chat (macro user id).
    pub user_id: String,
    /// The selected repository (`owner/name`).
    pub repo: String,
    /// The backend identifier (e.g. `daytona+claude_code`).
    pub backend: String,
    /// The provider-assigned sandbox id, once provisioned.
    pub sandbox_id: Option<String>,
    /// The current lifecycle status.
    pub status: SandboxStatus,
    /// The working branch in use, if a task has started.
    pub work_branch: Option<String>,
    /// The latest provider snapshot id, for warm resumes.
    pub snapshot_id: Option<String>,
}

impl SandboxRecord {
    /// The repository as a [`RepoRef`], if it parses.
    pub fn repo_ref(&self) -> Option<RepoRef> {
        RepoRef::parse(&self.repo)
    }
}
