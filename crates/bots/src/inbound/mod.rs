//! Inbound HTTP and Kafka adapters for bots.

#[cfg(feature = "inbound")]
/// Axum router for bot management.
pub mod axum_router;
#[cfg(feature = "inbound")]
/// Axum router for channel-scoped bot webhooks.
pub mod channel_webhook_router;
#[cfg(feature = "agent")]
/// Kafka consumer that triggers agent bots from mention events.
pub mod mention_consumer;
