//! Normalized, provider-agnostic models for coding agents.
//!
//! Every [`CodingAgentProvider`](super::ports::CodingAgentProvider) maps its
//! own wire format to and from these types, so callers (the AI tools, webhook
//! receivers, status pollers) never depend on a specific vendor.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Identifies which coding-agent backend produced or owns an agent.
///
/// New backends add a variant here; the rest of the system switches on it for
/// routing and persistence.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodingAgentProviderKind {
    /// Cursor Cloud (a.k.a. background) agents.
    Cursor,
    /// Anthropic Claude Managed Agents (hosted sessions).
    Claude,
}

impl CodingAgentProviderKind {
    /// Stable, lowercase identifier suitable for persistence and routing.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Cursor => "cursor",
            Self::Claude => "claude",
        }
    }

    /// Parse a provider kind from its [`as_str`](Self::as_str) identifier.
    pub fn from_wire(value: &str) -> Option<Self> {
        match value {
            "cursor" => Some(Self::Cursor),
            "claude" => Some(Self::Claude),
            _ => None,
        }
    }
}

impl std::fmt::Display for CodingAgentProviderKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Opaque, provider-assigned identifier for a launched agent.
///
/// Stored and echoed back verbatim; never parsed.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct CodingAgentId(pub String);

impl CodingAgentId {
    /// Borrow the underlying string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl From<String> for CodingAgentId {
    fn from(value: String) -> Self {
        Self(value)
    }
}

impl From<&str> for CodingAgentId {
    fn from(value: &str) -> Self {
        Self(value.to_owned())
    }
}

impl std::fmt::Display for CodingAgentId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

/// Normalized lifecycle state of an agent, unified across providers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CodingAgentStatus {
    /// Provisioning or queued; not yet executing.
    Pending,
    /// Actively working on the task.
    Running,
    /// Paused, waiting for the next instruction (e.g. a long-running session
    /// that has idled). Not terminal — send a follow-up to continue.
    AwaitingInput,
    /// Completed successfully (a result / PR is available).
    Finished,
    /// Ended in an error or failure.
    Failed,
    /// Stopped on request before completing.
    Stopped,
    /// Expired or timed out by the provider.
    Expired,
    /// A provider state we don't model explicitly; carries the raw value.
    Unknown(String),
}

impl CodingAgentStatus {
    /// A short, stable label for display and logging.
    pub fn as_str(&self) -> &str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::AwaitingInput => "awaiting_input",
            Self::Finished => "finished",
            Self::Failed => "failed",
            Self::Stopped => "stopped",
            Self::Expired => "expired",
            Self::Unknown(raw) => raw,
        }
    }

    /// Whether the agent has reached a terminal state and will not change again.
    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            Self::Finished | Self::Failed | Self::Stopped | Self::Expired
        )
    }
}

impl std::fmt::Display for CodingAgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// An image attached to a prompt (provider support varies).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentImage {
    /// Base64-encoded image bytes.
    pub base64_data: String,
    /// Optional pixel width.
    pub width: Option<u32>,
    /// Optional pixel height.
    pub height: Option<u32>,
}

/// The instruction given to an agent, with optional inline images.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentPrompt {
    /// The natural-language instruction.
    pub text: String,
    /// Optional inline images.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<AgentImage>,
}

impl AgentPrompt {
    /// Build a text-only prompt.
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            images: Vec::new(),
        }
    }
}

/// Where an agent runs: a repository and an optional starting ref.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSource {
    /// Repository the agent should operate on (e.g. a GitHub URL).
    pub repository: String,
    /// Optional branch, tag, or commit to start from. Defaults to the
    /// repository's default branch when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub git_ref: Option<String>,
}

/// What the agent should produce when it finishes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTarget {
    /// Branch name the agent should push its work to. Provider-generated when
    /// omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub branch_name: Option<String>,
    /// Whether the provider should open a pull request for the work.
    pub auto_create_pr: bool,
}

impl Default for AgentTarget {
    fn default() -> Self {
        Self {
            branch_name: None,
            auto_create_pr: true,
        }
    }
}

/// Webhook base configuration a provider is constructed with: where it should
/// deliver status events and the shared secret used to sign/verify them.
///
/// Held by the provider (not the launch request) — the provider decides how to
/// wire it up (Cursor sets it per-launch with a routing token appended; Claude's
/// is registered out-of-band and only the secret is used for verification).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookConfig {
    /// Base URL the provider posts status-change events to.
    pub url: String,
    /// Shared secret used to sign and verify deliveries.
    pub secret: String,
}

/// A request to launch a new coding agent run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchAgentRequest {
    /// The task for the agent to perform.
    pub prompt: AgentPrompt,
    /// The repository (and optional ref) to operate on.
    pub source: AgentSource,
    /// Optional model override; providers fall back to their default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Desired output (branch / PR behavior).
    #[serde(default)]
    pub target: AgentTarget,
    /// Opaque correlation (owner user / chat) the provider should round-trip so
    /// status events can be routed back. Providers attach it via whatever
    /// mechanism they support; ignored when the provider has no webhook wired.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correlation: Option<AgentCorrelation>,
    /// Provider-specific launch options that don't fit the normalized fields
    /// (e.g. a Claude `agent_id` / `environment_id`). Each provider reads only
    /// the keys it understands.
    #[serde(default, skip_serializing_if = "serde_json::Map::is_empty")]
    pub provider_options: serde_json::Map<String, serde_json::Value>,
}

/// A snapshot of a launched (or queried) coding agent.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodingAgent {
    /// Provider-assigned identifier.
    pub id: CodingAgentId,
    /// Which backend owns this agent.
    pub provider: CodingAgentProviderKind,
    /// Current lifecycle state.
    pub status: CodingAgentStatus,
    /// Human-friendly name, when the provider assigns one.
    pub name: Option<String>,
    /// The source the agent is operating on, when known.
    pub source: Option<AgentSource>,
    /// Branch the agent is pushing work to, when known.
    pub branch_name: Option<String>,
    /// Pull request URL, once one has been opened.
    pub pr_url: Option<String>,
    /// URL to view the agent in the provider's UI, when available.
    pub web_url: Option<String>,
    /// Short summary of the agent's progress or result, when available.
    pub summary: Option<String>,
    /// When the agent was created, when known.
    pub created_at: Option<DateTime<Utc>>,
}

/// The author of a conversation message.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentMessageRole {
    /// A message from the user / orchestrator.
    User,
    /// A message from the agent.
    Assistant,
    /// Any other role the provider reports.
    Other,
}

/// A single message in an agent's conversation transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentMessage {
    /// Who authored the message.
    pub role: AgentMessageRole,
    /// The message text.
    pub text: String,
}

/// A normalized status-change event, parsed from a verified provider webhook.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodingAgentEvent {
    /// Which backend emitted the event.
    pub provider: CodingAgentProviderKind,
    /// The agent the event is about.
    pub id: CodingAgentId,
    /// The agent's new status.
    pub status: CodingAgentStatus,
    /// Result/progress summary, when present.
    pub summary: Option<String>,
    /// Pull request URL, when present.
    pub pr_url: Option<String>,
    /// URL to view the agent, when present.
    pub web_url: Option<String>,
    /// Branch name, when present.
    pub branch_name: Option<String>,
    /// The correlation recovered by the provider (owner user / chat), used by
    /// the receiver to route the event. `None` if the provider couldn't recover
    /// it (e.g. the agent was launched without correlation).
    #[serde(default)]
    pub correlation: Option<AgentCorrelation>,
    /// The original, untouched payload, for downstream consumers that need
    /// provider-specific fields this model doesn't capture.
    pub raw: serde_json::Value,
}

/// Opaque correlation carried from launch through to status events: who (and
/// optionally which conversation) spawned the agent.
///
/// The spawn tool attaches it to [`LaunchAgentRequest::correlation`]; each
/// provider round-trips it however it can — the Cursor adapter encodes it in a
/// signed routing token in the webhook URL, the Claude adapter attaches it as
/// session metadata — and surfaces it back on [`CodingAgentEvent::correlation`]
/// so the receiver can route the update without any server-side
/// `agent → owner` mapping. See [`inbound::routing`](crate::inbound::routing).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentCorrelation {
    /// The user who spawned the agent.
    #[serde(rename = "u")]
    pub user_id: String,
    /// The conversation/chat the agent was spawned from, when known.
    #[serde(rename = "c", default, skip_serializing_if = "Option::is_none")]
    pub chat_id: Option<String>,
}

/// Declares which optional operations a provider supports, so callers can
/// degrade gracefully (e.g. fall back to polling when `webhooks` is false).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    /// Supports sending follow-up instructions to a running/finished agent.
    pub follow_up: bool,
    /// Supports stopping an in-progress agent.
    pub stop: bool,
    /// Supports deleting an agent.
    pub delete: bool,
    /// Supports retrieving the conversation transcript.
    pub conversation: bool,
    /// Supports status-change webhooks.
    pub webhooks: bool,
    /// Webhooks only fire on terminal states, so intermediate progress must be
    /// polled via [`get`](super::ports::CodingAgentProvider::get).
    pub requires_status_polling: bool,
}

/// Errors a [`CodingAgentProvider`](super::ports::CodingAgentProvider) can return.
#[derive(Debug, thiserror::Error)]
pub enum CodingAgentError {
    /// The operation is not supported by this provider.
    #[error("operation not supported by this provider")]
    Unsupported,
    /// The requested agent does not exist.
    #[error("coding agent not found: {0}")]
    NotFound(String),
    /// Authentication or authorization failed (e.g. missing/invalid API key).
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    /// The request was rejected as invalid by the provider or before sending.
    #[error("invalid request: {0}")]
    InvalidRequest(String),
    /// A webhook delivery failed signature verification or could not be parsed.
    #[error("webhook verification failed: {0}")]
    WebhookVerification(String),
    /// The provider returned an unexpected, non-success response.
    #[error("provider error (status {status}): {message}")]
    Provider {
        /// HTTP status code returned by the provider.
        status: u16,
        /// Error message extracted from the provider response.
        message: String,
    },
    /// A transport-level failure (network, timeout, TLS, decoding).
    #[error("transport error: {0}")]
    Transport(String),
    /// Any other error.
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}
