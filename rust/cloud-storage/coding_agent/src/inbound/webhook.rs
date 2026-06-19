//! Framework-agnostic webhook receiver.
//!
//! Hosting services (which own the HTTP framework, auth layer, and delivery
//! mechanism) mount a thin route that extracts the raw request body and calls
//! [`process_webhook`]. Keeping this logic free of any web framework makes it
//! unit-testable and reusable.
//!
//! The flow is:
//! 1. [`CodingAgentProvider::verify_and_parse_webhook`] authenticates the
//!    delivery and returns a normalized
//!    [`CodingAgentEvent`](crate::domain::models::CodingAgentEvent) — including
//!    the recovered [`correlation`](crate::domain::models::CodingAgentEvent::correlation).
//! 2. The event is handed to the [`CodingAgentEventSink`].
//!
//! The provider owns its webhook secret, so the receiver never sees it.

#[cfg(test)]
mod test;

use crate::domain::models::CodingAgentError;
use crate::domain::ports::{CodingAgentEventSink, CodingAgentProvider, WebhookHeaders};

/// Verify a status webhook delivery and dispatch it to `sink`.
///
/// `raw_body` MUST be the unparsed request body.
#[tracing::instrument(skip_all, err)]
pub async fn process_webhook(
    provider: &dyn CodingAgentProvider,
    sink: &dyn CodingAgentEventSink,
    headers: &dyn WebhookHeaders,
    raw_body: &[u8],
) -> Result<(), CodingAgentError> {
    // Authenticate + parse + recover correlation (all inside the provider).
    let event = provider.verify_and_parse_webhook(headers, raw_body)?;

    tracing::info!(
        provider = %event.provider,
        agent_id = %event.id,
        status = %event.status,
        user_id = event.correlation.as_ref().map(|c| c.user_id.as_str()),
        "received coding agent status webhook"
    );

    sink.deliver(event).await
}
