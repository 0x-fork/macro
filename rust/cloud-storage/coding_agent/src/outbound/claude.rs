//! Anthropic **Claude Managed Agents** implementation of [`CodingAgentProvider`].
//!
//! Managed Agents run Claude as a hosted, long-running **session** inside an
//! Anthropic-managed (or self-hosted) sandbox. A session references a
//! pre-configured **agent** (model/prompt/tools) and an **environment**
//! (where it runs, including GitHub access). You create a session, send it
//! events (user turns), poll/stream its status, and receive lifecycle webhooks.
//! See <https://platform.claude.com/docs/en/managed-agents/overview>.
//!
//! Mapping onto the generic contract:
//! - `launch`  → create a session (referencing `agent_id` + `environment_id`),
//!   carrying the [`AgentCorrelation`] as session metadata so it round-trips on
//!   webhook events.
//! - `get`     → fetch session status.
//! - `follow_up` → post a user event to the session.
//! - `delete`  → delete/archive the session.
//! - `conversation` → list session events.
//! - `verify_and_parse_webhook` → verify the signed delivery and recover the
//!   correlation from the session metadata in the payload.
//!
//! ⚠️ **BETA.** All requests require the `managed-agents-2026-04-01` beta header
//! and `x-api-key` auth. The exact endpoint paths and payload field names below
//! are isolated as constants/structs and reflect the documented session/event
//! model; **verify them against the live beta docs before production** — they
//! are deliberately kept in one place so they're trivial to correct.

#[cfg(test)]
mod test;

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::domain::models::{
    AgentCorrelation, AgentMessage, AgentMessageRole, CodingAgent, CodingAgentError,
    CodingAgentEvent, CodingAgentId, CodingAgentProviderKind, CodingAgentStatus,
    LaunchAgentRequest, ProviderCapabilities,
};
use crate::domain::ports::{CodingAgentProvider, WebhookHeaders};

/// Default base URL for the Claude API.
pub const CLAUDE_API_BASE_URL: &str = "https://api.anthropic.com";
/// Beta header required by all Managed Agents endpoints.
pub const MANAGED_AGENTS_BETA: &str = "managed-agents-2026-04-01";
/// Anthropic API version header value.
const ANTHROPIC_VERSION: &str = "2023-06-01";
/// Header carrying the webhook signature.
const SIGNATURE_HEADER: &str = "X-Webhook-Signature";
/// Metadata key under which we stash the routing correlation on a session.
const CORRELATION_METADATA_KEY: &str = "macro_correlation";

const SESSIONS_PATH: &str = "/v1/sessions";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

type HmacSha256 = Hmac<Sha256>;

/// A [`CodingAgentProvider`] backed by Claude Managed Agents.
#[derive(Clone)]
pub struct ClaudeAgentProvider {
    client: reqwest::Client,
    api_key: Arc<str>,
    base_url: Arc<str>,
    /// Default agent id to launch sessions against (overridable per launch via
    /// `provider_options.agent_id`).
    agent_id: Option<Arc<str>>,
    /// Default environment id sessions run in (overridable per launch via
    /// `provider_options.environment_id`).
    environment_id: Option<Arc<str>>,
    /// Console-registered webhook signing secret, used only for verification.
    webhook_secret: Option<Arc<str>>,
}

impl ClaudeAgentProvider {
    /// Build a provider from a Claude API key, using the default base URL.
    pub fn new(api_key: impl Into<Arc<str>>) -> Self {
        Self::with_base_url(api_key, CLAUDE_API_BASE_URL)
    }

    /// Build a provider pointed at a custom base URL (for tests / proxies).
    pub fn with_base_url(api_key: impl Into<Arc<str>>, base_url: impl Into<Arc<str>>) -> Self {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .unwrap_or_default();
        Self {
            client,
            api_key: api_key.into(),
            base_url: base_url.into(),
            agent_id: None,
            environment_id: None,
            webhook_secret: None,
        }
    }

    /// Set the default agent + environment new sessions reference.
    pub fn with_agent(
        mut self,
        agent_id: impl Into<Arc<str>>,
        environment_id: impl Into<Arc<str>>,
    ) -> Self {
        self.agent_id = Some(agent_id.into());
        self.environment_id = Some(environment_id.into());
        self
    }

    /// Set the webhook signing secret used to verify inbound deliveries.
    pub fn with_webhook_secret(mut self, secret: impl Into<Arc<str>>) -> Self {
        self.webhook_secret = Some(secret.into());
        self
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }

    fn require_api_key(&self) -> Result<(), CodingAgentError> {
        if self.api_key.trim().is_empty() {
            return Err(CodingAgentError::Unauthorized(
                "Claude API key is not configured".to_owned(),
            ));
        }
        Ok(())
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.client
            .request(method, self.url(path))
            .header("x-api-key", self.api_key.as_ref())
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("anthropic-beta", MANAGED_AGENTS_BETA)
    }

    async fn send_json<T: serde::de::DeserializeOwned>(
        &self,
        builder: reqwest::RequestBuilder,
    ) -> Result<T, CodingAgentError> {
        let response = builder
            .send()
            .await
            .map_err(|e| CodingAgentError::Transport(e.to_string()))?;
        let status = response.status();
        if status.is_success() {
            return response.json::<T>().await.map_err(|e| {
                CodingAgentError::Transport(format!("failed to decode response: {e}"))
            });
        }
        let body = response.text().await.unwrap_or_default();
        Err(map_status_error(status.as_u16(), body))
    }

    async fn send_ignore(&self, builder: reqwest::RequestBuilder) -> Result<(), CodingAgentError> {
        let response = builder
            .send()
            .await
            .map_err(|e| CodingAgentError::Transport(e.to_string()))?;
        let status = response.status();
        if status.is_success() {
            return Ok(());
        }
        let body = response.text().await.unwrap_or_default();
        Err(map_status_error(status.as_u16(), body))
    }

    /// Resolve the agent id for a launch: per-request override, else default.
    fn resolve_agent_id(&self, request: &LaunchAgentRequest) -> Result<String, CodingAgentError> {
        request
            .provider_options
            .get("agent_id")
            .and_then(|v| v.as_str())
            .map(str::to_owned)
            .or_else(|| self.agent_id.as_ref().map(|s| s.to_string()))
            .ok_or_else(|| {
                CodingAgentError::InvalidRequest(
                    "no Claude agent_id configured (set CLAUDE_MANAGED_AGENT_ID or pass provider_options.agent_id)"
                        .to_owned(),
                )
            })
    }

    fn resolve_environment_id(
        &self,
        request: &LaunchAgentRequest,
    ) -> Result<String, CodingAgentError> {
        request
            .provider_options
            .get("environment_id")
            .and_then(|v| v.as_str())
            .map(str::to_owned)
            .or_else(|| self.environment_id.as_ref().map(|s| s.to_string()))
            .ok_or_else(|| {
                CodingAgentError::InvalidRequest(
                    "no Claude environment_id configured (set CLAUDE_MANAGED_ENVIRONMENT_ID or pass provider_options.environment_id)"
                        .to_owned(),
                )
            })
    }
}

#[async_trait]
impl CodingAgentProvider for ClaudeAgentProvider {
    fn kind(&self) -> CodingAgentProviderKind {
        CodingAgentProviderKind::Claude
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            follow_up: true,
            // Stop/interrupt semantics aren't pinned down in the beta; expose
            // conservatively (the trait default returns Unsupported).
            stop: false,
            delete: true,
            conversation: true,
            webhooks: self.webhook_secret.is_some(),
            // Lifecycle webhooks cover idled/terminated, so polling is optional.
            requires_status_polling: false,
        }
    }

    #[tracing::instrument(skip_all, fields(repository = %request.source.repository), err)]
    async fn launch(&self, request: LaunchAgentRequest) -> Result<CodingAgent, CodingAgentError> {
        self.require_api_key()?;
        let agent_id = self.resolve_agent_id(&request)?;
        let environment_id = self.resolve_environment_id(&request)?;

        let metadata = request
            .correlation
            .as_ref()
            .map(|correlation| serde_json::json!({ CORRELATION_METADATA_KEY: correlation }));

        let body = ClaudeCreateSessionRequest {
            agent_id,
            environment_id,
            input: ClaudeInput::user_text(build_task_prompt(&request)),
            metadata,
        };

        let session: ClaudeSession = self
            .send_json(
                self.request(reqwest::Method::POST, SESSIONS_PATH)
                    .json(&body),
            )
            .await?;
        Ok(session.into_domain())
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn get(&self, id: &CodingAgentId) -> Result<CodingAgent, CodingAgentError> {
        self.require_api_key()?;
        let path = format!("{SESSIONS_PATH}/{}", id.as_str());
        let session: ClaudeSession = self
            .send_json(self.request(reqwest::Method::GET, &path))
            .await?;
        Ok(session.into_domain())
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn follow_up(
        &self,
        id: &CodingAgentId,
        prompt: crate::domain::models::AgentPrompt,
    ) -> Result<(), CodingAgentError> {
        self.require_api_key()?;
        let path = format!("{SESSIONS_PATH}/{}/events", id.as_str());
        let body = ClaudeInput::user_text(prompt.text);
        self.send_ignore(self.request(reqwest::Method::POST, &path).json(&body))
            .await
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn delete(&self, id: &CodingAgentId) -> Result<(), CodingAgentError> {
        self.require_api_key()?;
        let path = format!("{SESSIONS_PATH}/{}", id.as_str());
        self.send_ignore(self.request(reqwest::Method::DELETE, &path))
            .await
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn conversation(
        &self,
        id: &CodingAgentId,
    ) -> Result<Vec<AgentMessage>, CodingAgentError> {
        self.require_api_key()?;
        let path = format!("{SESSIONS_PATH}/{}/events", id.as_str());
        let events: ClaudeEventList = self
            .send_json(self.request(reqwest::Method::GET, &path))
            .await?;
        Ok(events.data.into_iter().filter_map(Into::into).collect())
    }

    fn verify_and_parse_webhook(
        &self,
        headers: &dyn WebhookHeaders,
        raw_body: &[u8],
        _url_token: Option<&str>,
    ) -> Result<CodingAgentEvent, CodingAgentError> {
        let secret = self.webhook_secret.as_deref().ok_or_else(|| {
            CodingAgentError::WebhookVerification(
                "Claude webhook secret is not configured".to_owned(),
            )
        })?;

        let signature = headers.get_header(SIGNATURE_HEADER).ok_or_else(|| {
            CodingAgentError::WebhookVerification(format!("missing {SIGNATURE_HEADER} header"))
        })?;
        verify_signature(secret, raw_body, signature)?;

        let payload: ClaudeWebhookPayload = serde_json::from_slice(raw_body).map_err(|e| {
            CodingAgentError::WebhookVerification(format!("malformed webhook payload: {e}"))
        })?;
        Ok(payload.into_event())
    }
}

/// Compose the task prompt; Managed Agents take a user turn, not a repo/branch
/// pair, so the repository is included as context in the instruction.
fn build_task_prompt(request: &LaunchAgentRequest) -> String {
    let mut prompt = request.prompt.text.clone();
    let repo = &request.source.repository;
    if !repo.is_empty() {
        prompt.push_str(&format!("\n\nRepository: {repo}"));
        if let Some(git_ref) = &request.source.git_ref {
            prompt.push_str(&format!(" (base ref: {git_ref})"));
        }
        if request.target.auto_create_pr {
            prompt.push_str("\nOpen a pull request with your changes when done.");
        }
    }
    prompt
}

fn map_status_error(status: u16, body: String) -> CodingAgentError {
    let message = extract_error_message(&body);
    match status {
        401 | 403 => CodingAgentError::Unauthorized(message),
        404 => CodingAgentError::NotFound(message),
        400 | 422 => CodingAgentError::InvalidRequest(message),
        _ => CodingAgentError::Provider { status, message },
    }
}

fn extract_error_message(body: &str) -> String {
    if body.trim().is_empty() {
        return "(empty response body)".to_owned();
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        // Anthropic errors are `{ "error": { "message": "..." } }`.
        if let Some(msg) = value
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return msg.to_owned();
        }
        for key in ["message", "detail"] {
            if let Some(msg) = value.get(key).and_then(|v| v.as_str()) {
                return msg.to_owned();
            }
        }
    }
    body.to_owned()
}

/// Verify a webhook signature over the raw body using constant-time comparison.
/// Accepts either `sha256=<hex>` or a bare `<hex>` signature.
fn verify_signature(
    secret: &str,
    raw_body: &[u8],
    signature: &str,
) -> Result<(), CodingAgentError> {
    use subtle::ConstantTimeEq;

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|e| CodingAgentError::WebhookVerification(format!("invalid secret: {e}")))?;
    mac.update(raw_body);
    let digest = hex::encode(mac.finalize().into_bytes());

    let prefixed = format!("sha256={digest}");
    let matches = bool::from(prefixed.as_bytes().ct_eq(signature.as_bytes()))
        || bool::from(digest.as_bytes().ct_eq(signature.as_bytes()));
    if matches {
        Ok(())
    } else {
        Err(CodingAgentError::WebhookVerification(
            "signature mismatch".to_owned(),
        ))
    }
}

/// Normalize a Managed Agents session status / lifecycle event to a
/// [`CodingAgentStatus`].
fn map_status(raw: &str) -> CodingAgentStatus {
    match raw.to_ascii_lowercase().as_str() {
        "created" | "queued" | "provisioning" | "pending" | "status_created" => {
            CodingAgentStatus::Pending
        }
        "running" | "active" | "status_run_started" => CodingAgentStatus::Running,
        "idle" | "idled" | "awaiting_input" | "status_idled" => CodingAgentStatus::AwaitingInput,
        "completed" | "succeeded" | "finished" | "status_completed" => CodingAgentStatus::Finished,
        "failed" | "error" | "errored" | "terminated" | "status_terminated" => {
            CodingAgentStatus::Failed
        }
        "cancelled" | "canceled" | "stopped" => CodingAgentStatus::Stopped,
        "expired" => CodingAgentStatus::Expired,
        other => CodingAgentStatus::Unknown(other.to_owned()),
    }
}

// --- Claude wire types -----------------------------------------------------

#[derive(Debug, Serialize)]
struct ClaudeCreateSessionRequest {
    agent_id: String,
    environment_id: String,
    input: ClaudeInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

/// A user input event/turn sent to a session.
#[derive(Debug, Serialize)]
struct ClaudeInput {
    #[serde(rename = "type")]
    kind: &'static str,
    content: String,
}

impl ClaudeInput {
    fn user_text(text: String) -> Self {
        Self {
            kind: "user_message",
            content: text,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ClaudeSession {
    id: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default, rename = "createdAt", alias = "created_at")]
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl ClaudeSession {
    fn into_domain(self) -> CodingAgent {
        let status = self
            .status
            .as_deref()
            .map(map_status)
            .unwrap_or(CodingAgentStatus::Pending);
        CodingAgent {
            id: CodingAgentId(self.id),
            provider: CodingAgentProviderKind::Claude,
            status,
            name: self.name,
            source: None,
            branch_name: None,
            pr_url: None,
            web_url: None,
            summary: None,
            created_at: self.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
struct ClaudeEventList {
    #[serde(default)]
    data: Vec<ClaudeEvent>,
}

#[derive(Debug, Deserialize)]
struct ClaudeEvent {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    text: Option<String>,
}

impl From<ClaudeEvent> for Option<AgentMessage> {
    fn from(event: ClaudeEvent) -> Self {
        let text = event.content.or(event.text)?;
        let role = match event.kind.as_str() {
            k if k.contains("user") => AgentMessageRole::User,
            k if k.contains("assistant") || k.contains("agent") => AgentMessageRole::Assistant,
            _ => AgentMessageRole::Other,
        };
        Some(AgentMessage { role, text })
    }
}

/// Managed Agents lifecycle webhook payload (e.g. `session.status_idled`).
#[derive(Debug, Deserialize)]
struct ClaudeWebhookPayload {
    #[serde(rename = "type")]
    event_type: String,
    #[serde(default)]
    session: Option<ClaudeWebhookSession>,
}

#[derive(Debug, Deserialize)]
struct ClaudeWebhookSession {
    id: String,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    metadata: Option<serde_json::Value>,
}

impl ClaudeWebhookPayload {
    fn into_event(self) -> CodingAgentEvent {
        let raw = serde_json::json!({ "type": self.event_type });
        let session = self.session;
        let id = session.as_ref().map(|s| s.id.clone()).unwrap_or_default();
        // Prefer an explicit session status; fall back to the event type.
        let status = session
            .as_ref()
            .and_then(|s| s.status.as_deref())
            .map(map_status)
            .unwrap_or_else(|| map_status(&self.event_type));
        let correlation = session
            .as_ref()
            .and_then(|s| s.metadata.as_ref())
            .and_then(|m| m.get(CORRELATION_METADATA_KEY))
            .and_then(|v| serde_json::from_value::<AgentCorrelation>(v.clone()).ok());

        CodingAgentEvent {
            provider: CodingAgentProviderKind::Claude,
            id: CodingAgentId(id),
            status,
            summary: None,
            pr_url: None,
            web_url: None,
            branch_name: None,
            correlation,
            raw,
        }
    }
}
