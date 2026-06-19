//! The [`CodingAgentProvider`] contract every backend implements.

use async_trait::async_trait;

use super::models::{
    AgentMessage, AgentPrompt, CodingAgent, CodingAgentError, CodingAgentEvent, CodingAgentId,
    CodingAgentProviderKind, LaunchAgentRequest, ProviderCapabilities,
};

/// Read-only access to the headers of an inbound webhook request.
///
/// Kept abstract so the domain stays free of any specific HTTP framework; the
/// service mounting the receiver adapts its header map to this trait. Lookups
/// are case-insensitive.
///
/// `Send + Sync` so a `&dyn WebhookHeaders` can be held across the `.await` in
/// an async webhook handler without making the handler's future non-`Send`.
pub trait WebhookHeaders: Send + Sync {
    /// Returns the first value of the named header, if present.
    fn get_header(&self, name: &str) -> Option<&str>;
}

impl WebhookHeaders for std::collections::HashMap<String, String> {
    fn get_header(&self, name: &str) -> Option<&str> {
        self.iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

/// A backend capable of running cloud coding agents.
///
/// Implementations live in [`outbound`](crate::outbound). All methods speak the
/// normalized [`models`](super::models) types, so callers never depend on a
/// particular vendor. Optional operations default to
/// [`CodingAgentError::Unsupported`]; advertise real support via
/// [`capabilities`](Self::capabilities).
///
/// Designed to be used as a trait object (`Arc<dyn CodingAgentProvider>`).
#[async_trait]
pub trait CodingAgentProvider: Send + Sync {
    /// Which backend this is.
    fn kind(&self) -> CodingAgentProviderKind;

    /// What this provider can do, so callers can degrade gracefully.
    fn capabilities(&self) -> ProviderCapabilities;

    /// Launch a new agent run and return its initial snapshot.
    async fn launch(&self, request: LaunchAgentRequest) -> Result<CodingAgent, CodingAgentError>;

    /// Fetch the current snapshot of an agent. This is the polling primitive
    /// for tracking progress when webhooks don't cover intermediate states.
    async fn get(&self, id: &CodingAgentId) -> Result<CodingAgent, CodingAgentError>;

    /// Send a follow-up instruction to an existing agent.
    async fn follow_up(
        &self,
        id: &CodingAgentId,
        prompt: AgentPrompt,
    ) -> Result<(), CodingAgentError> {
        let _ = (id, prompt);
        Err(CodingAgentError::Unsupported)
    }

    /// Request that an in-progress agent stop.
    async fn stop(&self, id: &CodingAgentId) -> Result<(), CodingAgentError> {
        let _ = id;
        Err(CodingAgentError::Unsupported)
    }

    /// Permanently delete an agent.
    async fn delete(&self, id: &CodingAgentId) -> Result<(), CodingAgentError> {
        let _ = id;
        Err(CodingAgentError::Unsupported)
    }

    /// Retrieve an agent's conversation transcript.
    async fn conversation(
        &self,
        id: &CodingAgentId,
    ) -> Result<Vec<AgentMessage>, CodingAgentError> {
        let _ = id;
        Err(CodingAgentError::Unsupported)
    }

    /// Verify an inbound webhook delivery and parse it into a normalized
    /// [`CodingAgentEvent`] (including the recovered
    /// [`correlation`](CodingAgentEvent::correlation)).
    ///
    /// The provider owns its webhook secret (from construction), so it isn't
    /// passed here. Implementations MUST authenticate the delivery (signature
    /// over the raw, unparsed `raw_body`) before trusting any of it, and return
    /// [`CodingAgentError::WebhookVerification`] on mismatch.
    fn verify_and_parse_webhook(
        &self,
        headers: &dyn WebhookHeaders,
        raw_body: &[u8],
    ) -> Result<CodingAgentEvent, CodingAgentError>;
}

/// Resolves the GitHub access token used to clone a repository on behalf of a
/// user.
///
/// The spawn tool calls this with the spawning user's id and passes the result
/// to the provider as
/// [`LaunchAgentRequest::git_token`](crate::domain::models::LaunchAgentRequest::git_token).
/// Implementations live in the hosting service, backed by Macro's GitHub
/// integration. Returning `None` means no token is connected — the provider
/// then attempts an unauthenticated clone (public repos only).
#[async_trait]
pub trait GitTokenResolver: Send + Sync {
    /// Return the GitHub access token for `user_id`, if one is connected.
    async fn github_token(&self, user_id: &str) -> Result<Option<String>, CodingAgentError>;
}

/// Destination for verified status events.
///
/// The [`webhook`](crate::inbound::webhook) receiver verifies a delivery and
/// hands the resulting [`CodingAgentEvent`] (which carries its
/// [`correlation`](CodingAgentEvent::correlation)) to a sink; the hosting
/// service implements the sink to surface it to the user (e.g. a realtime push
/// over the connection gateway, a notification, or a chat message).
#[async_trait]
pub trait CodingAgentEventSink: Send + Sync {
    /// Deliver a verified status event.
    async fn deliver(&self, event: CodingAgentEvent) -> Result<(), CodingAgentError>;
}
