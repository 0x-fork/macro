//! The [`CodingAgentProvider`] contract every backend implements.

use async_trait::async_trait;

use super::models::{
    AgentMessage, AgentPrompt, CodingAgent, CodingAgentError, CodingAgentEvent, CodingAgentId,
    CodingAgentProviderKind, LaunchAgentRequest, ProviderCapabilities, RoutedCodingAgentEvent,
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

    /// Verify an inbound webhook's signature against `secret` and parse it into
    /// a normalized [`CodingAgentEvent`].
    ///
    /// Implementations MUST verify the signature over the raw, unparsed
    /// `raw_body` before trusting any of it, and return
    /// [`CodingAgentError::WebhookVerification`] on mismatch.
    fn verify_and_parse_webhook(
        &self,
        headers: &dyn WebhookHeaders,
        raw_body: &[u8],
        secret: &str,
    ) -> Result<CodingAgentEvent, CodingAgentError>;
}

/// Destination for verified status events.
///
/// The [`webhook`](crate::inbound::webhook) receiver verifies a delivery and
/// hands the resulting [`RoutedCodingAgentEvent`] to a sink; the hosting service
/// implements the sink to actually surface it to the user (e.g. a realtime push
/// over the connection gateway, a notification, or a chat message).
#[async_trait]
pub trait CodingAgentEventSink: Send + Sync {
    /// Deliver a verified, routed status event.
    async fn deliver(&self, event: RoutedCodingAgentEvent) -> Result<(), CodingAgentError>;
}
