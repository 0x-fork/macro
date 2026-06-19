//! Framework-agnostic webhook receiver.
//!
//! Hosting services (which own the HTTP framework, auth layer, and delivery
//! mechanism) mount a thin route that extracts the routing token from the URL
//! and the raw request body, then call [`process_webhook`]. Keeping this logic
//! free of any web framework makes it unit-testable and reusable.
//!
//! The flow is:
//! 1. Verify the provider's body signature (via
//!    [`CodingAgentProvider::verify_and_parse_webhook`]) → a normalized
//!    [`CodingAgentEvent`](crate::domain::models::CodingAgentEvent).
//! 2. Authenticate and decode the routing token from the URL → a
//!    [`RouteTarget`](crate::domain::models::RouteTarget).
//! 3. Hand the [`RoutedCodingAgentEvent`] to the [`CodingAgentEventSink`].
//!
//! Both steps 1 and 2 use the same shared webhook secret.

#[cfg(test)]
mod test;

use crate::domain::models::{CodingAgentError, RoutedCodingAgentEvent};
use crate::domain::ports::{CodingAgentEventSink, CodingAgentProvider, WebhookHeaders};

use super::routing::verify_route_token;

/// Verify a status webhook delivery and dispatch it to `sink`.
///
/// `secret` is the shared webhook secret (used for both the provider body
/// signature and the routing token). `token` is the routing token taken from
/// the webhook URL path. `raw_body` MUST be the unparsed request body.
#[tracing::instrument(skip_all, err)]
pub async fn process_webhook(
    provider: &dyn CodingAgentProvider,
    secret: &str,
    sink: &dyn CodingAgentEventSink,
    headers: &dyn WebhookHeaders,
    token: &str,
    raw_body: &[u8],
) -> Result<(), CodingAgentError> {
    // 1. Authenticate + parse the provider payload over the raw body.
    let event = provider.verify_and_parse_webhook(headers, raw_body, secret)?;
    // 2. Authenticate + recover the routing target from the URL token.
    let route = verify_route_token(secret, token)?;

    tracing::info!(
        agent_id = %event.id,
        status = %event.status,
        user_id = %route.user_id,
        "received coding agent status webhook"
    );

    // 3. Deliver.
    sink.deliver(RoutedCodingAgentEvent { event, route }).await
}
