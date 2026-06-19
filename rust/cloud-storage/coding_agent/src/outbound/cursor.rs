//! Cursor Cloud (background) agents implementation of [`CodingAgentProvider`].
//!
//! Wraps the Cursor Cloud Agents REST API (`https://api.cursor.com`, run-based
//! `/v0/agents` endpoints, `Authorization: Bearer <key>` auth) and maps it to
//! the normalized [`crate::domain`] models.
//!
//! Status webhooks are signed by Cursor with HMAC-SHA256 over the raw request
//! body, delivered in the `X-Webhook-Signature: sha256=<hex>` header;
//! [`CursorAgentProvider::verify_and_parse_webhook`] verifies them.

#[cfg(test)]
mod test;

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::domain::models::{
    AgentMessage, AgentMessageRole, AgentPrompt, AgentSource, CodingAgent, CodingAgentError,
    CodingAgentEvent, CodingAgentId, CodingAgentProviderKind, CodingAgentStatus,
    LaunchAgentRequest, ProviderCapabilities,
};
use crate::domain::ports::{CodingAgentProvider, WebhookHeaders};

/// Default base URL for the Cursor Cloud Agents API.
pub const CURSOR_API_BASE_URL: &str = "https://api.cursor.com";

/// Header Cursor uses to deliver the webhook signature (`sha256=<hex>`).
const SIGNATURE_HEADER: &str = "X-Webhook-Signature";

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

type HmacSha256 = Hmac<Sha256>;

/// A [`CodingAgentProvider`] backed by the Cursor Cloud Agents API.
#[derive(Clone)]
pub struct CursorAgentProvider {
    client: reqwest::Client,
    api_key: Arc<str>,
    base_url: Arc<str>,
}

impl CursorAgentProvider {
    /// Build a provider from an API key, using the default Cursor base URL.
    pub fn new(api_key: impl Into<Arc<str>>) -> Self {
        Self::with_base_url(api_key, CURSOR_API_BASE_URL)
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
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url.trim_end_matches('/'), path)
    }

    /// Guard against making a request with no API key configured, which would
    /// otherwise surface as an opaque 401.
    fn require_api_key(&self) -> Result<(), CodingAgentError> {
        if self.api_key.trim().is_empty() {
            return Err(CodingAgentError::Unauthorized(
                "CURSOR_API_KEY is not configured".to_owned(),
            ));
        }
        Ok(())
    }

    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        self.client
            .request(method, self.url(path))
            .bearer_auth(self.api_key.as_ref())
    }

    /// Send a request and deserialize a successful JSON body, mapping HTTP
    /// errors onto [`CodingAgentError`].
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

    /// Send a request, mapping HTTP errors but discarding any success body.
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
}

#[async_trait]
impl CodingAgentProvider for CursorAgentProvider {
    fn kind(&self) -> CodingAgentProviderKind {
        CodingAgentProviderKind::Cursor
    }

    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            follow_up: true,
            stop: true,
            delete: true,
            conversation: true,
            webhooks: true,
            // Cursor only fires webhooks on terminal (FINISHED/ERROR) states, so
            // intermediate progress must be polled.
            requires_status_polling: true,
        }
    }

    #[tracing::instrument(skip_all, fields(repository = %request.source.repository), err)]
    async fn launch(&self, request: LaunchAgentRequest) -> Result<CodingAgent, CodingAgentError> {
        self.require_api_key()?;
        let body = CursorLaunchRequest::from_request(&request);
        let agent: CursorAgent = self
            .send_json(
                self.request(reqwest::Method::POST, "/v0/agents")
                    .json(&body),
            )
            .await?;
        Ok(agent.into_domain())
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn get(&self, id: &CodingAgentId) -> Result<CodingAgent, CodingAgentError> {
        self.require_api_key()?;
        let path = format!("/v0/agents/{}", id.as_str());
        let agent: CursorAgent = self
            .send_json(self.request(reqwest::Method::GET, &path))
            .await?;
        Ok(agent.into_domain())
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn follow_up(
        &self,
        id: &CodingAgentId,
        prompt: AgentPrompt,
    ) -> Result<(), CodingAgentError> {
        self.require_api_key()?;
        let path = format!("/v0/agents/{}/followup", id.as_str());
        let body = CursorFollowUpRequest {
            prompt: CursorPrompt::from(&prompt),
        };
        self.send_ignore(self.request(reqwest::Method::POST, &path).json(&body))
            .await
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn stop(&self, id: &CodingAgentId) -> Result<(), CodingAgentError> {
        self.require_api_key()?;
        let path = format!("/v0/agents/{}/stop", id.as_str());
        self.send_ignore(self.request(reqwest::Method::POST, &path))
            .await
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn delete(&self, id: &CodingAgentId) -> Result<(), CodingAgentError> {
        self.require_api_key()?;
        let path = format!("/v0/agents/{}", id.as_str());
        self.send_ignore(self.request(reqwest::Method::DELETE, &path))
            .await
    }

    #[tracing::instrument(skip_all, fields(agent_id = %id), err)]
    async fn conversation(
        &self,
        id: &CodingAgentId,
    ) -> Result<Vec<AgentMessage>, CodingAgentError> {
        self.require_api_key()?;
        let path = format!("/v0/agents/{}/conversation", id.as_str());
        let convo: CursorConversation = self
            .send_json(self.request(reqwest::Method::GET, &path))
            .await?;
        Ok(convo.messages.into_iter().map(Into::into).collect())
    }

    fn verify_and_parse_webhook(
        &self,
        headers: &dyn WebhookHeaders,
        raw_body: &[u8],
        secret: &str,
    ) -> Result<CodingAgentEvent, CodingAgentError> {
        let signature = headers.get_header(SIGNATURE_HEADER).ok_or_else(|| {
            CodingAgentError::WebhookVerification(format!("missing {SIGNATURE_HEADER} header"))
        })?;

        verify_signature(secret, raw_body, signature)?;

        let payload: CursorWebhookPayload = serde_json::from_slice(raw_body).map_err(|e| {
            CodingAgentError::WebhookVerification(format!("malformed webhook payload: {e}"))
        })?;

        Ok(payload.into_event())
    }
}

/// Map an HTTP status + body to a [`CodingAgentError`].
fn map_status_error(status: u16, body: String) -> CodingAgentError {
    let message = extract_error_message(&body);
    match status {
        401 | 403 => CodingAgentError::Unauthorized(message),
        404 => CodingAgentError::NotFound(message),
        400 | 422 => CodingAgentError::InvalidRequest(message),
        _ => CodingAgentError::Provider { status, message },
    }
}

/// Pull a human-readable message out of a Cursor error body, falling back to
/// the raw text.
fn extract_error_message(body: &str) -> String {
    if body.trim().is_empty() {
        return "(empty response body)".to_owned();
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(body) {
        for key in ["error", "message", "detail"] {
            if let Some(msg) = value.get(key).and_then(|v| v.as_str()) {
                return msg.to_owned();
            }
        }
    }
    body.to_owned()
}

/// Verify a Cursor webhook signature (`sha256=<hex>`) over the raw body using
/// constant-time comparison.
fn verify_signature(
    secret: &str,
    raw_body: &[u8],
    signature: &str,
) -> Result<(), CodingAgentError> {
    use subtle::ConstantTimeEq;

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|e| CodingAgentError::WebhookVerification(format!("invalid secret: {e}")))?;
    mac.update(raw_body);
    let expected = format!("sha256={}", hex::encode(mac.finalize().into_bytes()));

    let matches: bool = expected.as_bytes().ct_eq(signature.as_bytes()).into();
    if matches {
        Ok(())
    } else {
        Err(CodingAgentError::WebhookVerification(
            "signature mismatch".to_owned(),
        ))
    }
}

/// Normalize a Cursor status string to a [`CodingAgentStatus`].
fn map_status(raw: &str) -> CodingAgentStatus {
    match raw.to_ascii_uppercase().as_str() {
        "CREATING" | "PENDING" | "QUEUED" => CodingAgentStatus::Pending,
        "RUNNING" => CodingAgentStatus::Running,
        "FINISHED" | "COMPLETED" => CodingAgentStatus::Finished,
        "ERROR" | "FAILED" => CodingAgentStatus::Failed,
        "STOPPED" | "CANCELLED" | "CANCELED" => CodingAgentStatus::Stopped,
        "EXPIRED" => CodingAgentStatus::Expired,
        _ => CodingAgentStatus::Unknown(raw.to_owned()),
    }
}

// --- Cursor wire types -----------------------------------------------------

#[derive(Debug, Serialize)]
struct CursorLaunchRequest {
    prompt: CursorPrompt,
    source: CursorSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target: Option<CursorTarget>,
    #[serde(skip_serializing_if = "Option::is_none")]
    webhook: Option<CursorWebhook>,
}

impl CursorLaunchRequest {
    fn from_request(request: &LaunchAgentRequest) -> Self {
        Self {
            prompt: CursorPrompt::from(&request.prompt),
            source: CursorSource {
                repository: request.source.repository.clone(),
                git_ref: request.source.git_ref.clone(),
            },
            model: request.model.clone(),
            target: Some(CursorTarget {
                branch_name: request.target.branch_name.clone(),
                auto_create_pr: request.target.auto_create_pr,
            }),
            webhook: request.webhook.as_ref().map(|w| CursorWebhook {
                url: w.url.clone(),
                secret: Some(w.secret.clone()),
            }),
        }
    }
}

#[derive(Debug, Serialize)]
struct CursorPrompt {
    text: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    images: Vec<CursorImage>,
}

impl From<&AgentPrompt> for CursorPrompt {
    fn from(prompt: &AgentPrompt) -> Self {
        Self {
            text: prompt.text.clone(),
            images: prompt
                .images
                .iter()
                .map(|image| CursorImage {
                    base64_data: image.base64_data.clone(),
                    width: image.width,
                    height: image.height,
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize)]
struct CursorImage {
    base64_data: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    height: Option<u32>,
}

#[derive(Debug, Serialize)]
struct CursorSource {
    repository: String,
    #[serde(rename = "ref", skip_serializing_if = "Option::is_none")]
    git_ref: Option<String>,
}

#[derive(Debug, Serialize)]
struct CursorTarget {
    #[serde(rename = "branchName", skip_serializing_if = "Option::is_none")]
    branch_name: Option<String>,
    #[serde(rename = "autoCreatePr")]
    auto_create_pr: bool,
}

#[derive(Debug, Serialize)]
struct CursorWebhook {
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    secret: Option<String>,
}

#[derive(Debug, Serialize)]
struct CursorFollowUpRequest {
    prompt: CursorPrompt,
}

/// The Cursor agent object, returned by launch / get.
#[derive(Debug, Deserialize)]
struct CursorAgent {
    id: String,
    #[serde(default)]
    name: Option<String>,
    status: String,
    #[serde(default)]
    source: Option<CursorSourceResponse>,
    #[serde(default)]
    target: Option<CursorTargetResponse>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default, rename = "createdAt")]
    created_at: Option<chrono::DateTime<chrono::Utc>>,
}

impl CursorAgent {
    fn into_domain(self) -> CodingAgent {
        let target = self.target;
        CodingAgent {
            id: CodingAgentId(self.id),
            provider: CodingAgentProviderKind::Cursor,
            status: map_status(&self.status),
            name: self.name,
            source: self.source.map(|s| AgentSource {
                repository: s.repository.unwrap_or_default(),
                git_ref: s.git_ref,
            }),
            branch_name: target.as_ref().and_then(|t| t.branch_name.clone()),
            pr_url: target.as_ref().and_then(|t| t.pr_url.clone()),
            web_url: target.as_ref().and_then(|t| t.url.clone()),
            summary: self.summary,
            created_at: self.created_at,
        }
    }
}

#[derive(Debug, Deserialize)]
struct CursorSourceResponse {
    #[serde(default)]
    repository: Option<String>,
    #[serde(default, rename = "ref")]
    git_ref: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CursorTargetResponse {
    #[serde(default, rename = "branchName")]
    branch_name: Option<String>,
    #[serde(default, rename = "prUrl")]
    pr_url: Option<String>,
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CursorConversation {
    #[serde(default)]
    messages: Vec<CursorMessage>,
}

#[derive(Debug, Deserialize)]
struct CursorMessage {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: String,
}

impl From<CursorMessage> for AgentMessage {
    fn from(message: CursorMessage) -> Self {
        let role = match message.kind.as_str() {
            "user_message" => AgentMessageRole::User,
            "assistant_message" => AgentMessageRole::Assistant,
            _ => AgentMessageRole::Other,
        };
        Self {
            role,
            text: message.text,
        }
    }
}

/// The `statusChange` webhook payload Cursor delivers.
#[derive(Debug, Deserialize)]
struct CursorWebhookPayload {
    id: String,
    status: String,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    target: Option<CursorTargetResponse>,
}

impl CursorWebhookPayload {
    fn into_event(self) -> CodingAgentEvent {
        let raw = serde_json::json!({
            "id": self.id,
            "status": self.status,
            "summary": self.summary,
        });
        let target = self.target;
        CodingAgentEvent {
            provider: CodingAgentProviderKind::Cursor,
            id: CodingAgentId(self.id),
            status: map_status(&self.status),
            summary: self.summary,
            pr_url: target.as_ref().and_then(|t| t.pr_url.clone()),
            web_url: target.as_ref().and_then(|t| t.url.clone()),
            branch_name: target.as_ref().and_then(|t| t.branch_name.clone()),
            raw,
        }
    }
}
