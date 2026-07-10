//! Webhook event payloads.
//!
//! Single source of truth for every entity event a webhook subscriber can
//! receive. Wraps the internal broker events so the OpenAPI schema (and the
//! TypeScript types generated from it) stay in lockstep with what is actually
//! published to the `macro.documents` and `macro.channels` topics.

use channels::domain::broker_events::ChannelTopicEvent;
use documents::domain::events::DocumentTopicEvent;
use serde::{Deserialize, Serialize};

/// Any entity event deliverable to a webhook endpoint.
///
/// Serialized bodies carry an `event_type` tag naming the event (for example
/// `document.created` or `channel.message_posted`) and a `metadata` object
/// with the event payload. Endpoint validation additionally sends a
/// `WebhookValidationTestEvent`, which is not part of this union.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "inbound", derive(utoipa::ToSchema))]
#[serde(untagged)]
pub enum WebhookEvent {
    /// Document lifecycle events from the `macro.documents` topic.
    Document(DocumentTopicEvent),
    /// Channel and message events from the `macro.channels` topic.
    Channel(ChannelTopicEvent),
}
